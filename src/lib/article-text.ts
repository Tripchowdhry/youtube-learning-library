import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { fetchPage } from "@/lib/fetch-page";
import { xPostId } from "@/lib/links";
import type { ArticleBlock, ArticleContent } from "@/lib/types";

const BLOCK_TYPES: Record<string, ArticleBlock["type"]> = {
  H1: "h", H2: "h", H3: "h", H4: "h", P: "p", LI: "li", BLOCKQUOTE: "quote", PRE: "p",
};

// Gets an article's main text as plain blocks (no HTML from the other site).
export async function readArticle(url: URL): Promise<ArticleContent> {
  const postId = xPostId(url);
  if (postId) return { kind: "x", postId };

  const none: ArticleContent = { kind: "none" };
  const html = await fetchPage(url);
  if (!html) return none;

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
  if (words < 80) return none;
  return { kind: "text", blocks };
}
