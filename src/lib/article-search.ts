import type { SupabaseClient } from "@supabase/supabase-js";
import type { ArticleBlock } from "@/lib/types";

// The label search gives an article's own text, so results can say "Found in the article: …".
export const ARTICLE_LABEL = "the article";

// The saved text of every article you've opened (supabase/article-texts.sql), by link, as plain
// text for search. Read once per visit, and only once someone searches, since it's the biggest
// thing search looks at. `fresh` reads it again. Empty if that table isn't set up.
let kept: Promise<Map<string, string>> | null = null;
export function loadArticleTexts(supabase: SupabaseClient, fresh = false) {
  if (fresh) kept = null;
  kept ??= (async () => {
    const { data, error } = await supabase.from("article_texts").select("url, blocks").limit(2000);
    if (error) return new Map<string, string>();
    return new Map(
      (data ?? []).map((row: { url: string; blocks: ArticleBlock[] | null }) => [
        row.url,
        Array.isArray(row.blocks) ? row.blocks.map((b) => b.text).join("\n") : "",
      ]),
    );
  })().catch(() => {
    kept = null;
    return new Map<string, string>();
  });
  return kept;
}
