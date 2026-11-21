// Deleting a video, an article or tutorial, or a ScrapBook page deletes everything that belongs
// only to it. The row's own notes and handwriting go with it; this also removes what is kept
// elsewhere: pasted pictures, attached files, the saved copy of an article's text, and its
// place in reports (the reports themselves stay).

import type { SupabaseClient } from "@supabase/supabase-js";
import { clipPathsIn, deleteLeftoverClips } from "@/lib/clips";
import { deleteScrapFiles, type ScrapFile } from "@/lib/files";
import type { NotePage } from "@/lib/types";

export type ItemKind = "video" | "article" | "scrap";

type Leftovers = { clips: string[]; files: string[]; url: string | null };
const NOTHING: Leftovers = { clips: [], files: [], url: null };

const TABLES: Record<ItemKind, string> = { video: "videos", article: "articles", scrap: "scraps" };

// Read before deleting, since the notes go with the row.
async function readLeftovers(supabase: SupabaseClient, kind: ItemKind, id: string): Promise<Leftovers> {
  if (kind === "video") {
    const { data } = await supabase.from("notes").select("pages, text").eq("video_id", id).maybeSingle();
    return { ...NOTHING, clips: clipPathsIn(data as { pages: NotePage[] | null; text: string | null } | null) };
  }
  if (kind === "article") {
    // Handwriting in Reading needs supabase/article-pages.sql; without it, read just the typed notes.
    let res = await supabase.from("articles").select("url, notes, pages").eq("id", id).maybeSingle();
    if (res.error) res = await supabase.from("articles").select("url, notes").eq("id", id).maybeSingle();
    const row = res.data as { url: string | null; notes: string | null; pages?: NotePage[] | null } | null;
    return { ...NOTHING, clips: clipPathsIn(row && { pages: row.pages, text: row.notes }), url: row?.url ?? null };
  }
  // Attached files need supabase/files.sql; without it, a page has none.
  let res = await supabase.from("scraps").select("body, pages, files").eq("id", id).maybeSingle();
  if (res.error) res = await supabase.from("scraps").select("body, pages").eq("id", id).maybeSingle();
  const row = res.data as { body: string | null; pages: NotePage[] | null; files?: ScrapFile[] | null } | null;
  return { ...NOTHING, clips: clipPathsIn(row), files: (row?.files ?? []).map((f) => f.path) };
}

// The saved copy of an article's text, unless the same link is still saved elsewhere (say in
// both Reading and Tutorials).
async function forgetArticleText(supabase: SupabaseClient, url: string) {
  const { data, error } = await supabase.from("articles").select("id").eq("url", url).limit(1);
  if (error || data?.length) return;
  await supabase.from("article_texts").delete().eq("url", url);
}

// Takes it out of every report's list of sources, and drops the text read from its handwriting.
async function forgetInReports(supabase: SupabaseClient, kind: "video" | "article", id: string) {
  await supabase.from("report_sources").delete().eq("source_kind", kind).eq("source_id", id);
  const key = `${kind}:${id}`;
  const { data, error } = await supabase.from("reports").select("id, handwriting");
  if (error) return;
  for (const report of data ?? []) {
    const handwriting = (report.handwriting ?? {}) as Record<string, string>;
    if (!(key in handwriting)) continue;
    const { [key]: _gone, ...rest } = handwriting;
    void _gone;
    await supabase.from("reports").update({ handwriting: rest }).eq("id", report.id);
  }
}

// Deletes the item and everything that belongs only to it. Returns the error message if the item
// itself couldn't be deleted. A leftover that couldn't be tidied away doesn't stop it: a picture
// then shows as unused in Manage clips.
export async function deleteItem(supabase: SupabaseClient, kind: ItemKind, id: string): Promise<string | null> {
  const leftovers = await readLeftovers(supabase, kind, id).catch(() => NOTHING);
  const { error } = await supabase.from(TABLES[kind]).delete().eq("id", id);
  if (error) return error.message;
  await Promise.allSettled([
    deleteLeftoverClips(supabase, leftovers.clips),
    leftovers.files.length ? deleteScrapFiles(supabase, leftovers.files) : null,
    kind === "scrap" ? null : forgetInReports(supabase, kind, id),
    leftovers.url ? forgetArticleText(supabase, leftovers.url) : null,
  ]);
  return null;
}
