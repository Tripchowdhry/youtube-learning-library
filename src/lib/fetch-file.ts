import { isPublicHost } from "@/lib/fetch-page";

// Gemini reads PDFs up to 50 MB (about 1,000 pages).
export const MAX_FILE_BYTES = 50_000_000;

export type FetchedFile = { bytes: Buffer; mimeType: string };
export type FileResult = FetchedFile | { error: string } | null;

// Share links from Dropbox and Google Drive open a preview page. This turns them into a
// link to the file itself, or returns null for other links.
export function directFileLink(url: URL): URL | null {
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (host === "dropbox.com" && /^\/(s|scl\/fi)\//.test(url.pathname)) {
    const direct = new URL(url.href);
    direct.searchParams.delete("dl");
    direct.searchParams.set("dl", "1");
    return direct;
  }
  if (host === "dl.dropboxusercontent.com") return url;
  if (host === "drive.google.com") {
    const id = url.pathname.match(/\/file\/d\/([\w-]+)/)?.[1] ?? url.searchParams.get("id");
    if (id) return new URL(`https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`);
  }
  return null;
}

// A link that probably points at a file rather than a web page.
export function looksLikeFile(url: URL) {
  return Boolean(directFileLink(url)) || /\.(pdf|txt|md|epub)$/i.test(url.pathname);
}

function fileType(bytes: Buffer, header: string, path: string): string | null {
  if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (/\.epub$/i.test(path) || header.includes("epub")) return "epub";
  if (header.startsWith("text/plain") || header.startsWith("text/markdown") || /\.(txt|md)$/i.test(path)) {
    return "text/plain";
  }
  return null;
}

// Downloads a PDF or text file. Returns null if the link is a web page (or unreachable),
// or { error } when it's a file the AI can't read.
export async function fetchFile(start: URL): Promise<FileResult> {
  let url = directFileLink(start) ?? start;
  try {
    for (let hop = 0; hop < 6; hop++) {
      if (!isPublicHost(url.hostname)) return null;
      const res = await fetch(url, {
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; BrainShelf/1.0; +https://mybrainshelf.vercel.app)",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(60_000),
      });
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        url = new URL(location, url);
        continue;
      }
      const header = (res.headers.get("content-type") ?? "").toLowerCase();
      if (!res.ok || header.includes("html")) {
        await res.body?.cancel();
        if (directFileLink(start)) {
          return {
            error: "The file couldn't be opened. Check that its share link is set to “Anyone with the link”.",
          };
        }
        return null;
      }
      const size = Number(res.headers.get("content-length") ?? 0);
      if (size > MAX_FILE_BYTES) {
        await res.body?.cancel();
        return { error: tooBig(size) };
      }
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length > MAX_FILE_BYTES) return { error: tooBig(bytes.length) };
      const disposition = res.headers.get("content-disposition") ?? "";
      const name = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)/i)?.[1] ?? url.pathname;
      const type = fileType(bytes, header, decodeURIComponent(name));
      if (type === "epub") {
        return {
          error: "This is an EPUB book, which the AI can't open. Save it as a PDF and share that link instead.",
        };
      }
      if (!type)
        return directFileLink(start)
          ? {
              error: "The AI can read PDF and text files, but not this kind of file.",
            }
          : null;
      return { bytes, mimeType: type };
    }
  } catch {
    // Unreachable, timeout or bad redirect.
  }
  return null;
}

function tooBig(bytes: number) {
  return `This file is ${Math.round(bytes / 1_000_000)} MB. The AI can read files up to 50 MB, so try a smaller part of the book.`;
}
