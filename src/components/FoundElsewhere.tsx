"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { allTags } from "@/lib/ai-tags";
import { ARTICLE_LABEL, loadArticleTexts } from "@/lib/article-search";
import { htmlToText } from "@/lib/html-text";
import { meaningText } from "@/lib/meaning";
import {
  TAGS_LABEL,
  hashTag,
  matches,
  notesText,
  prepare,
  queryWords,
  tagTest,
  type SearchIndex,
} from "@/lib/search";
import { createClient } from "@/lib/supabase/client";

// The tabs search can look in, with where each one lives.
export type Section =
  | "videos"
  | "reading"
  | "tutorial"
  | "scrapbook"
  | "reports";
export const SECTIONS: { key: Section; name: string; path: string }[] = [
  { key: "videos", name: "Videos", path: "/" },
  { key: "reading", name: "Reading", path: "/reading" },
  { key: "tutorial", name: "Tutorials", path: "/tutorials" },
  { key: "scrapbook", name: "ScrapBook", path: "/scrapbook" },
  { key: "reports", name: "Report Writer", path: "/reports" },
];

// One saved item, ready to search: where it lives, what to show, and the page that opens it.
// `meaning` is the text its meaning fingerprint is made from (see meaning-sync.ts).
export type Entry = {
  section: Section;
  id: string;
  title: string;
  sub: string;
  href: string;
  index: SearchIndex;
  tags: string[];
  meaning: string;
};

// A link that opens a tab with a search already typed in.
export const searchHref = (path: string, query: string) =>
  `${path}?q=${encodeURIComponent(query)}`;

// Reads ?q= when a tab opens from one of those links, puts it in the search box, and tidies the address.
export function useSearchFromLink(setQuery: (q: string) => void) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    if (!q) return;
    setQuery(q);
    params.delete("q");
    const rest = params.toString();
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (rest ? `?${rest}` : ""),
    );
    // Runs once, when the tab opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// Reads a table's rows for search: with AI tags if that SQL has been run, else without.
async function rows(
  supabase: ReturnType<typeof createClient>,
  table: string,
  columns: string,
) {
  for (const cols of [
    columns,
    columns.replace(", ai_tags", ""),
    columns.replace(", tags, ai_tags", ""),
  ]) {
    const { data, error } = await supabase.from(table).select(cols).limit(5000);
    if (!error) return (data ?? []) as unknown as Record<string, unknown>[];
  }
  return [];
}

// Everything in every tab (not Vault), read once per visit and only when it's needed.
// `fresh` reads it again, so something saved a moment ago shows up.
let everything: Promise<Entry[]> | null = null;
export function loadEverything(fresh = false) {
  if (fresh) everything = null;
  everything ??= (async () => {
    const supabase = createClient();
    const text = (v: unknown) => (typeof v === "string" ? v : "");
    const [videos, notes, articles, scraps, reports, articleText] =
      await Promise.all([
        rows(supabase, "videos", "id, title, channel, note, tags, ai_tags"),
        rows(supabase, "notes", "video_id, text"),
        rows(
          supabase,
          "articles",
          "id, title, url, site, author, note, notes, kind, tags, ai_tags",
        ),
        rows(supabase, "scraps", "id, title, body, tags, ai_tags"),
        rows(supabase, "reports", "id, title, body, tags, ai_tags"),
        loadArticleTexts(supabase, fresh),
      ]);
    const noteOf = new Map(
      notes.map((n) => [n.video_id, notesText(text(n.text))]),
    );
    const entry = (
      section: Section,
      row: Record<string, unknown>,
      href: string,
      sub: string,
      fields: { label: string; text: string }[],
    ): Entry => {
      const tags = allTags(row as { tags?: string[]; ai_tags?: string[] });
      const title = fields[0].text || "Untitled";
      const about = meaningText([
        ...fields
          .slice(1)
          .filter((f) => f.label !== "the link")
          .map((f) => f.text),
        tags.length ? `Tags: ${tags.join(", ")}` : "",
      ]);
      return {
        section,
        id: text(row.id),
        title,
        sub,
        href,
        tags,
        meaning: about,
        index: prepare([
          ...fields,
          { label: TAGS_LABEL, text: tags.join(", ") },
        ]),
      };
    };
    return [
      ...videos.map((v) =>
        entry("videos", v, `/video/${text(v.id)}`, text(v.channel), [
          { label: "Title", text: text(v.title) },
          { label: "the channel", text: text(v.channel) },
          { label: "the summary", text: text(v.note) },
          { label: "your notes", text: noteOf.get(v.id) ?? "" },
        ]),
      ),
      ...articles.map((a) =>
        entry(
          a.kind === "tutorial" ? "tutorial" : "reading",
          a,
          `/read/${text(a.id)}`,
          [text(a.site), text(a.author)].filter(Boolean).join(" · "),
          [
            { label: "Title", text: text(a.title) || text(a.url) },
            {
              label: "the site",
              text: [text(a.site), text(a.author)].filter(Boolean).join(" · "),
            },
            { label: "the summary", text: text(a.note) },
            { label: "your notes", text: notesText(text(a.notes)) },
            { label: "the link", text: text(a.url) },
            { label: ARTICLE_LABEL, text: articleText.get(text(a.url)) ?? "" },
          ],
        ),
      ),
      ...scraps.map((s) =>
        entry("scrapbook", s, `/scrap/${text(s.id)}`, "", [
          { label: "Title", text: text(s.title) },
          { label: "the page", text: htmlToText(text(s.body)) },
        ]),
      ),
      ...reports.map((r) =>
        entry("reports", r, `/report/${text(r.id)}`, "", [
          { label: "Title", text: text(r.title) },
          { label: "the report", text: notesText(text(r.body)) },
        ]),
      ),
    ];
  })().catch(() => {
    everything = null;
    return [];
  });
  return everything;
}

// Under "Nothing matches": how many matches the other tabs have, each a link that opens that
// tab with the same search. Shows nothing when the other tabs have none either.
export default function FoundElsewhere({
  query,
  here,
}: {
  query: string;
  here: Section;
}) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const q = query.trim();

  useEffect(() => {
    if (!q) return;
    let live = true;
    loadEverything().then((list) => live && setEntries(list));
    return () => {
      live = false;
    };
  }, [q]);

  const counts = useMemo(() => {
    if (!entries || !q) return [];
    const typed = hashTag(q);
    const words = typed === null ? queryWords(q) : [];
    const tagOk = tagTest(null, typed);
    const found = new Map<Section, number>();
    for (const e of entries) {
      if (e.section === here) continue;
      if (tagOk ? tagOk(e.tags) : matches(e.index, words))
        found.set(e.section, (found.get(e.section) ?? 0) + 1);
    }
    return SECTIONS.filter((s) => found.has(s.key)).map((s) => ({
      ...s,
      count: found.get(s.key)!,
    }));
  }, [entries, q, here]);

  if (!counts.length) return null;
  return (
    <p className="mt-3 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-sm text-slate-600">
      <span>Found elsewhere:</span>
      {counts.map((c, i) => (
        <span key={c.key}>
          <Link
            href={searchHref(c.path, q)}
            className="font-medium text-blue-700 hover:underline"
          >
            {c.count} in {c.name}
          </Link>
          {i < counts.length - 1 && <span className="text-slate-400"> · </span>}
        </span>
      ))}
    </p>
  );
}
