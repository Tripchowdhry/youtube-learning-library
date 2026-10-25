import { isIP } from "node:net";

const MAX_BYTES = 3_000_000;

// Blocks links to this server or a private network, so the app can't be used to reach them.
function isPublicHost(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    return false;
  }
  if (isIP(host) === 4) {
    const [a, b] = host.split(".").map(Number);
    return !(a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127));
  }
  if (isIP(host) === 6) return false;
  return true;
}

// Downloads a web page's HTML, or returns null if the site refuses or it isn't a page.
export async function fetchPage(start: URL): Promise<string | null> {
  let url = start;
  try {
    // Follow redirects by hand so every hop gets the same public-host check.
    for (let hop = 0; hop < 5; hop++) {
      if (!isPublicHost(url.hostname)) return null;
      const res = await fetch(url, {
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; LearningLibrary/1.0; +https://ytlearnlib.vercel.app)",
          accept: "text/html,application/xhtml+xml",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
      });
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        url = new URL(location, url);
        continue;
      }
      if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
      const html = await res.text();
      return html.length > MAX_BYTES ? html.slice(0, MAX_BYTES) : html;
    }
  } catch {
    // Unreachable site, timeout or bad redirect.
  }
  return null;
}
