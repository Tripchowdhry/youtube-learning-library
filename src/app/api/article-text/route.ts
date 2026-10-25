import { NextResponse } from "next/server";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { fetchPage } from "@/lib/fetch-page";
import { parseLink, xPostId } from "@/lib/links";
import { isSignedIn } from "@/lib/require-user";
import type { ArticleBlock, ArticleContent } from "@/lib/types";

const BLOCK_TYPES: Record<string, ArticleBlock["type"]> = {
  H1: "h", H2: "h", H3: "h", H4: "h", P: "p", LI: "li", BLOCKQUOTE: "quote", PRE: "p",
};

// Gets an article's main text for the reading page. Only plain text is sent back
// (no HTML from the other site), so nothing from that site can run inside the app.
export async function GET(request: Request) {
  if (!(await isSignedIn())) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const url = parseLink(new URL(request.url).searchParams.get("url") ?? "");
  if (!url) return NextResponse.json({ error: "That doesn't look like a web link." }, { status: 400 });

  const postId = xPostId(url);
  if (postId) return NextResponse.json({ kind: "x", postId } satisfies ArticleContent);

  const none: ArticleContent = { kind: "none" };
  const html = await fetchPage(url);
  if (!html) return NextResponse.json(none);

  let blocks: ArticleBlock[] = [];
  try {
    const { document } = parseHTML(html);
    const article = new Readability(document as unknown as Document).parse();
    if (article?.content) {
      const { document: body } = parseHTML(`<div id="root">${article.content}</div>`);
      for (const el of body.querySelectorAll("h1, h2, h3, h4, p, li, blockquote, pre")) {
        // Skip blocks nested inside another block (like a <p> inside a <blockquote>) to avoid repeats.
        if (el.parentElement?.closest("p, li, blockquote, pre")) continue;
        const text = (el.textContent ?? "").replace(/[ \t\r\n]+/g, " ").trim();
        if (text) blocks.push({ type: BLOCK_TYPES[el.tagName] ?? "p", text });
      }
    }
  } catch {
    blocks = [];
  }

  // Too little text usually means a login wall or a page that's mostly pictures.
  const words = blocks.reduce((n, b) => n + b.text.split(" ").length, 0);
  if (words < 80) return NextResponse.json(none);
  return NextResponse.json({ kind: "text", blocks } satisfies ArticleContent);
}
