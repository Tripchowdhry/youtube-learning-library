// AI tags: when something new is saved, the AI adds up to 3 tags of its own (shown in purple),
// and you keep up to 2 of yours (tags.ts). They're stored apart (ai_tags), so each keeps its look.
// This file is shared by the server route (/api/tag-ai) and the pages, so it has no server-only parts.

import type { SupabaseClient } from "@supabase/supabase-js";
import { postAi } from "@/lib/ai-request";

export const AI_TAGS_MAX = 3;

export type AiTagKind = "video" | "article" | "tutorial" | "scrap" | "report";
type Table = "videos" | "articles" | "scraps" | "reports";

// An item's tags for search and the tag filter: yours, then the AI's.
export const allTags = (item: { tags?: string[] | null; ai_tags?: string[] | null }) => [...(item.tags ?? []), ...(item.ai_tags ?? [])];

// The AI's answer as tags: lower case, short, no "#" or bullets, no repeats, at most 3. A tag that
// matches one of your existing tags apart from capitals is written the way you wrote it.
export function cleanAiTags(answer: string, existing: string[] = []) {
  const known = new Map(existing.map((t) => [t.toLowerCase(), t]));
  const tags: string[] = [];
  for (const raw of answer.split(/[,\n]/)) {
    const tag = raw
      .replace(/^[\s\-*•\d.)#"'`]+|["'`.\s]+$/g, "")
      .replace(/\s+/g, " ")
      .toLowerCase();
    if (!tag || tag.length > 30 || tag.split(" ").length > 3 || /^tags?:?$/.test(tag)) continue;
    const named = known.get(tag) ?? tag;
    if (!tags.some((t) => t.toLowerCase() === named.toLowerCase())) tags.push(named);
    if (tags.length === AI_TAGS_MAX) break;
  }
  return tags;
}

// ---------- In the browser ----------

// The on/off switch lives on the AI usage page and is kept with the account, so it's the same on
// every device. On unless turned off.
export async function aiTagsOn(supabase: SupabaseClient) {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.user_metadata?.ai_tags !== false;
}

export async function setAiTagsOn(supabase: SupabaseClient, on: boolean) {
  const { error } = await supabase.auth.updateUser({ data: { ai_tags: on } });
  return !error;
}

// Every tag already in use, in all tabs, so the AI reuses them instead of making near-copies.
// Read at most once a minute.
let known: { at: number; tags: Promise<string[]> } | null = null;
function knownTags(supabase: SupabaseClient) {
  if (known && Date.now() - known.at < 60_000) return known.tags;
  const read = async (table: Table) => {
    const withAi = await supabase.from(table).select("tags, ai_tags").limit(2000);
    const rows = withAi.error ? (await supabase.from(table).select("tags").limit(2000)).data : withAi.data;
    return ((rows ?? []) as { tags?: string[] | null; ai_tags?: string[] | null }[]).flatMap(allTags);
  };
  const tags = Promise.all((["videos", "articles", "scraps", "reports"] as Table[]).map((t) => read(t).catch(() => [])))
    .then((lists) => {
      const seen = new Map<string, string>();
      for (const tag of lists.flat()) if (!seen.has(tag.toLowerCase())) seen.set(tag.toLowerCase(), tag);
      return [...seen.values()];
    });
  known = { at: Date.now(), tags };
  return tags;
}

const TABLE: Record<AiTagKind, Table> = { video: "videos", article: "articles", tutorial: "articles", scrap: "scraps", report: "reports" };

// Asks the AI for an item's tags and saves them. Runs in the background after saving, so it never
// slows anything down; if AI tags are off, the AI isn't set up, or the SQL hasn't been run, it
// quietly does nothing. Returns the tags it saved, or null.
export async function tagWithAi(
  supabase: SupabaseClient,
  kind: AiTagKind,
  id: string,
  item: { title: string | null | undefined; about?: string | null; text?: string | null },
): Promise<string[] | null> {
  try {
    if (!(await aiTagsOn(supabase))) return null;
    const existing = await knownTags(supabase);
    const res = await postAi("/api/tag-ai", {
      kind,
      title: item.title ?? "",
      about: item.about ?? "",
      text: (item.text ?? "").slice(0, 3_000),
      existing,
    });
    const tags = res.ok && Array.isArray(res.data.tags) ? (res.data.tags as string[]).slice(0, AI_TAGS_MAX) : null;
    if (!tags) return null;
    const { error } = await supabase.from(TABLE[kind]).update({ ai_tags: tags }).eq("id", id);
    if (error) return null;
    // New tags join the list the next item is tagged from.
    if (known) known.tags = known.tags.then((list) => [...list, ...tags.filter((t) => !list.some((k) => k.toLowerCase() === t.toLowerCase()))]);
    return tags;
  } catch {
    return null;
  }
}

// ---------- Tagging what was saved before AI tags ----------

export type Untagged = { kind: AiTagKind; id: string; title: string; about: string; text: string };

// Everything not tagged by the AI yet (ai_tags is null). Items whose AI tags you removed have an
// empty list and are left alone. Empty before supabase/ai-tags.sql is run.
export async function findUntagged(supabase: SupabaseClient): Promise<Untagged[]> {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const read = async (table: Table, columns: string) => {
    const { data, error } = await supabase.from(table).select(columns).is("ai_tags", null).limit(1000);
    return error ? [] : ((data ?? []) as unknown as Record<string, unknown>[]);
  };
  const [videos, articles, scraps, reports] = await Promise.all([
    read("videos", "id, title, channel, note"),
    read("articles", "id, title, url, site, author, note, kind"),
    read("scraps", "id, title, body"),
    read("reports", "id, title, body"),
  ]);
  const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  return [
    ...videos.map((v) => ({ kind: "video" as const, id: str(v.id), title: str(v.title), about: str(v.channel), text: str(v.note) })),
    ...articles.map((a) => ({
      kind: a.kind === "tutorial" ? ("tutorial" as const) : ("article" as const),
      id: str(a.id),
      title: str(a.title) || str(a.url),
      about: [str(a.site), str(a.author)].filter(Boolean).join(", "),
      text: str(a.note),
    })),
    ...scraps.map((s) => ({ kind: "scrap" as const, id: str(s.id), title: str(s.title), about: "", text: plain(str(s.body)) })),
    ...reports.map((r) => ({ kind: "report" as const, id: str(r.id), title: str(r.title), about: "", text: r.body ? str(r.body) : "" })),
  ].filter((item) => item.id && (item.title.trim() || item.text.trim()));
}
