import { NextResponse } from "next/server";
import { parseHTML } from "linkedom";
import { fetchPage } from "@/lib/fetch-page";
import { cleanLink, parseLink, siteName, xPostId } from "@/lib/links";
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
  let publisher: string | null = null;
  let link: string | null = null;

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
        const p = document.querySelector("p");
        // Links in a post show as t.co addresses, which make a poor title: leave them out.
        title = clean(p?.textContent?.replace(/(https?:\/\/t\.co|pic\.twitter\.com)\/\S+/g, ""), 140);
        link = p?.querySelector('a[href^="https://t.co/"]')?.getAttribute("href") ?? null;
      }
    } catch {
      // Fall through; the user can type a title.
    }
    // A post that is only a link (often an X Article): use the article's or the linked page's title.
    if (!title) title = await xLinkedTitle(xPostId(url)!, link);
    if (!title && author) title = `Post by ${author}`;
  } else {
    const html = await fetchPage(url);
    if (html) {
      const { document } = parseHTML(html);
      const meta = (name: string) =>
        document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute("content");
      title = clean(meta("og:title") ?? meta("twitter:title") ?? document.querySelector("title")?.textContent);
      const ld = linkedData(document);
      // article:author is often a link to a profile page, which isn't a name.
      author = clean([meta("author"), ld.author, meta("article:author")].find((a) => a && !/^https?:/i.test(a.trim())), 100);
      // The company or publication behind the page, for pages that don't name a person.
      publisher = clean(ld.publisher ?? meta("og:site_name") ?? meta("application-name"), 100);
    }
  }

  return NextResponse.json({ url: cleanLink(url), title, site, author, publisher });
}

// The title of an X Article, or of the page a link-only post points to, or null.
async function xLinkedTitle(id: string, link: string | null): Promise<string | null> {
  try {
    // The public data X's own embeds read. It names an X Article's title, or a link card's.
    const token = ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
    const res = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${token}`, {
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json();
      const found = clean(data?.article?.title ?? data?.card?.binding_values?.title?.string_value, 140);
      if (found) return found;
    }
  } catch {
    // Try the link itself.
  }
  if (!link) return null;
  const html = await fetchPage(new URL(link));
  if (!html) return null;
  const { document } = parseHTML(html);
  const meta = (name: string) =>
    document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute("content");
  const found = clean(meta("og:title") ?? meta("twitter:title") ?? document.querySelector("title")?.textContent, 140);
  // X's own pages need signing in and only say "X".
  return found && !/^(x|twitter|x\.com)$/i.test(found) ? found : null;
}

type LdNode = { "@type"?: string | string[]; "@graph"?: LdNode[]; author?: unknown; publisher?: unknown; name?: unknown };

// A name from schema.org data: a string, { name }, or a list of those (the first one).
function ldName(value: unknown): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first === "string") return first;
  if (first && typeof first === "object" && typeof (first as LdNode).name === "string") return (first as LdNode).name as string;
  return undefined;
}

// The author and publisher many news sites and blogs list in their schema.org (JSON-LD) data.
function linkedData(document: { querySelectorAll: (s: string) => Iterable<{ textContent: string | null }> }) {
  const found: { author?: string; publisher?: string } = {};
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    let data: unknown;
    try {
      data = JSON.parse(script.textContent ?? "");
    } catch {
      continue;
    }
    const nodes: LdNode[] = (Array.isArray(data) ? data : [data]).flatMap((n: LdNode) => (n?.["@graph"] ? n["@graph"] : [n]));
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      found.author ??= ldName(node.author);
      found.publisher ??= ldName(node.publisher);
    }
  }
  return found;
}
