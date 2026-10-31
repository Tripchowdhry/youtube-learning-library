import type { SupabaseClient } from "@supabase/supabase-js";
import { linkKey } from "@/lib/links";
import { parseYouTubeId } from "@/lib/youtube";

// Where in the app a link is already saved, so it's never saved twice in different tabs.
// href opens that tab with the saved item shown in its folder (?show=id).
export type SavedElsewhere = { where: string; href: string };

type Named = { id: string; name: string; parent_id: string | null };

// "Parent › Child" for a folder or category, walking up its parents.
function pathOf(rows: Named[] | null, id: string | null, none: string) {
  if (!id) return none;
  const byId = new Map((rows ?? []).map((r) => [r.id, r]));
  const names: string[] = [];
  for (let row = byId.get(id); row && names.length < 10; row = row.parent_id ? byId.get(row.parent_id) : undefined) {
    names.unshift(row.name);
  }
  return names.join(" › ") || none;
}

const SECTIONS: Record<string, { name: string; path: string }> = {
  reading: { name: "Reading", path: "/reading" },
  tutorial: { name: "Tutorials", path: "/tutorials" },
};

// Looks for the links in every tab except `skip` (the tab doing the adding, which checks its own list).
// YouTube links match by video, whatever their format; other links by linkKey.
export async function findSavedElsewhere(
  supabase: SupabaseClient,
  links: string[],
  skip: "videos" | "reading" | "tutorial",
): Promise<SavedElsewhere | null> {
  const youtubeIds = new Set(links.map(parseYouTubeId).filter(Boolean));
  const keys = new Set(links.map(linkKey).filter(Boolean));

  if (skip !== "videos" && youtubeIds.size) {
    const { data } = await supabase
      .from("videos")
      .select("id, folder_id")
      .in("youtube_id", [...youtubeIds])
      .limit(1);
    const video = data?.[0];
    if (video) {
      const { data: folders } = await supabase.from("folders").select("id, name, parent_id");
      return { where: `Videos › ${pathOf(folders, video.folder_id, "Unsorted")}`, href: `/?show=${video.id}` };
    }
  }

  let query = supabase.from("articles").select("id, url, kind, category_id");
  if (skip !== "videos") query = query.neq("kind", skip);
  const { data: articles } = await query;
  const match = (articles ?? []).find((a) => {
    const id = parseYouTubeId(a.url);
    return keys.has(linkKey(a.url)) || (id !== null && youtubeIds.has(id));
  });
  if (!match) return null;
  const { data: cats } = await supabase.from("article_categories").select("id, name, parent_id");
  const section = SECTIONS[match.kind] ?? SECTIONS.reading;
  return {
    where: `${section.name} › ${pathOf(cats, match.category_id, "Uncategorized")}`,
    href: `${section.path}?show=${match.id}`,
  };
}
