import { NextResponse } from "next/server";
import { parseHTML } from "linkedom";
import { fetchPage } from "@/lib/fetch-page";
import { parseLink, siteName, xPostId } from "@/lib/links";
import { isSignedIn } from "@/lib/require-user";

const clean = (text: string | null | undefined, max = 200) => {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t ? (t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t) : null;
};

// Looks up a link's title (and author for X posts) so it fills in by itself.
export async function GET(request: Request) {
  if (!(await isSignedIn())) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const url = parseLink(new URL(request.url).searchParams.get("url") ?? "");
  if (!url) return NextResponse.json({ error: "That doesn't look like a web link." }, { status: 400 });

  const site = siteName(url);
  let title: string | null = null;
  let author: string | null = null;

  if (xPostId(url)) {
    // X's public oEmbed endpoint needs no key and returns the post's text and author.
    try {
      const res = await fetch(
        `https://publish.twitter.com/oembed?omit_script=1&dnt=true&url=${encodeURIComponent(url.href)}`,
        { next: { revalidate: 86400 } },
      );
      if (res.ok) {
        const data = await res.json();
        author = clean(data.author_name, 100);
        const { document } = parseHTML(`<div>${data.html ?? ""}</div>`);
        title = clean(document.querySelector("p")?.textContent, 140);
      }
    } catch {
      // Fall through; the user can type a title.
    }
    if (!title && author) title = `Post by ${author}`;
  } else {
    const html = await fetchPage(url);
    if (html) {
      const { document } = parseHTML(html);
      const meta = (name: string) =>
        document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute("content");
      title = clean(meta("og:title") ?? meta("twitter:title") ?? document.querySelector("title")?.textContent);
      author = clean(meta("author") ?? meta("article:author"), 100);
    }
  }

  return NextResponse.json({ url: url.href, title, site, author });
}
