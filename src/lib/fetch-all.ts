import type { PostgrestError } from "@supabase/supabase-js";

type Rows<T> = { data: T[] | null; error: PostgrestError | null };

// The database hands back at most 1,000 rows per request, so a big library would be cut off
// without a word. This asks page by page until every row is in. Give the query a unique
// last sort (like "id") so no row is skipped or repeated between pages.
const PAGE = 1000;

export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<Rows<T>>): Promise<Rows<T>> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) return { data: null, error };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return { data: rows, error: null };
  }
}
