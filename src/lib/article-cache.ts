import type { SupabaseClient } from "@supabase/supabase-js";
import { readArticle } from "@/lib/article-text";
import type { ArticleBlock, ArticleContent } from "@/lib/types";

// Bigger than any normal article; a page this large isn't kept, just read each time.
const KEEP_MAX = 500_000;

// An article's text, read from the web page only the first time. After that it comes from the
// article_texts table, which saves the server from downloading and pulling apart the page again
// whenever the article is reopened or the AI is asked about it. `link` is the article's link
// exactly as saved. Only links the person has saved are kept, and only pages with text.
// If the table isn't set up yet (supabase/article-texts.sql), the page is simply read each time.
export async function readSavedArticle(supabase: SupabaseClient, link: string, url: URL): Promise<ArticleContent> {
  const kept = await supabase.from("article_texts").select("blocks").eq("url", link).maybeSingle();
  const blocks = (kept.data as { blocks?: ArticleBlock[] } | null)?.blocks;
  if (!kept.error && Array.isArray(blocks) && blocks.length) return { kind: "text", blocks };

  const content = await readArticle(url);
  if (content.kind !== "text" || kept.error) return content;
  if (JSON.stringify(content.blocks).length > KEEP_MAX) return content;

  const saved = await supabase.from("articles").select("id").eq("url", link).limit(1);
  if (!saved.error && saved.data?.length) {
    await supabase.from("article_texts").upsert({ url: link, blocks: content.blocks }, { onConflict: "user_id,url", ignoreDuplicates: true });
  }
  return content;
}
