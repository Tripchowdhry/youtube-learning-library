// Report Writer: brings your notes from Videos, Reading, Tutorials and ScrapBook together into one report.
// It only reads the videos, notes, articles and scraps tables; reports live in their own tables
// (supabase/reports.sql), so nothing here can change the other sections.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/fetch-all";
import { clipUrl, splitTypedClips, type TypedClip } from "@/lib/clips";
import { htmlToText } from "@/lib/html-text";
import type { NotePage } from "@/lib/types";
import { formatTime } from "@/lib/youtube-player";

export type Report = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  // Text read from handwritten notes, by sourceKey. Only there once supabase/report-handwriting.sql is run.
  handwriting?: Record<string, string>;
  // Set while the report is shared as a read-only link (supabase/report-share.sql).
  share_token?: string | null;
  created_at: string;
  updated_at: string;
};

export type SourceKind = "video" | "article" | "scrap";
export type SourceSection = "videos" | "reading" | "tutorial" | "scrap";

export const SECTION_NAMES: Record<SourceSection, string> = {
  videos: "Video",
  reading: "Reading",
  tutorial: "Tutorial",
  scrap: "ScrapBook page",
};

// One video, reading or tutorial that a report can draw on.
export type ReportSource = {
  kind: SourceKind;
  id: string;
  section: SourceSection;
  title: string;
  // The channel (videos) or website (reading and tutorials).
  sub: string | null;
  // The link to the video or article; empty for a ScrapBook page, which has none outside BrainShelf.
  url: string;
  category: string | null;
  // Typed notes and AI answers, without the clips.
  notes: string;
  clips: TypedClip[];
  // Handwriting pages with something on them, and those pages themselves.
  handPages: number;
  pages: NotePage[];
  createdAt: string;
};

export const sourceKey = (s: { kind: SourceKind; id: string }) => `${s.kind}:${s.id}`;

export const hasNotes = (s: ReportSource) => Boolean(s.notes.trim() || s.clips.length || s.handPages);

// Report Writer needs supabase/reports.sql; before it's run the tables are missing.
export const isMissingTable = (message: string) => /does not exist|schema cache|relation/i.test(message);

type VideoRow = { id: string; title: string | null; channel: string | null; url: string; category_id: string | null; created_at: string };
type NoteRow = { video_id: string; text: string | null; pages: NotePage[] | null };
type ArticleRow = {
  id: string;
  title: string | null;
  site: string | null;
  url: string;
  kind: string;
  category_id: string | null;
  notes?: string | null;
  pages?: NotePage[] | null;
  created_at: string;
};
type ScrapRow = { id: string; title: string | null; body: string | null; pages: NotePage[] | null; category_id: string | null; created_at: string };
type CategoryRow = { id: string; name: string };

const usedPages = (pages: NotePage[] | null | undefined) =>
  (pages ?? []).filter((p) => p?.strokes?.length || p?.stamps?.length || p?.images?.length);

function handwriting(pages: NotePage[] | null | undefined) {
  const used = usedPages(pages);
  return { handPages: used.length, pages: used };
}

// Every video, reading and tutorial, with its notes. Read-only.
export async function loadSources(supabase: SupabaseClient): Promise<ReportSource[]> {
  const [v, n, vc, a, ac, sc] = await Promise.all([
    fetchAll((from, to) => supabase.from("videos").select("id, title, channel, url, category_id, created_at").order("id").range(from, to)),
    fetchAll((from, to) => supabase.from("notes").select("video_id, text, pages").order("id").range(from, to)),
    fetchAll((from, to) => supabase.from("video_categories").select("id, name").order("id").range(from, to)),
    // "*" so this still works before the article notes column exists.
    fetchAll((from, to) => supabase.from("articles").select("*").order("id").range(from, to)),
    fetchAll((from, to) => supabase.from("article_categories").select("id, name").order("id").range(from, to)),
    fetchAll((from, to) => supabase.from("scraps").select("id, title, body, pages, category_id, created_at").order("id").range(from, to)),
  ]);
  if (v.error) throw new Error(v.error.message);

  const notes = new Map(((n.data ?? []) as NoteRow[]).map((r) => [r.video_id, r]));
  const categoryName = new Map(
    [...((vc.data ?? []) as CategoryRow[]), ...((ac.data ?? []) as CategoryRow[])].map((c) => [c.id, c.name]),
  );

  const videos: ReportSource[] = ((v.data ?? []) as VideoRow[]).map((row) => {
    const note = notes.get(row.id);
    const { text, clips } = splitTypedClips(note?.text ?? "");
    return {
      kind: "video",
      id: row.id,
      section: "videos",
      title: row.title || "Untitled video",
      sub: row.channel,
      url: row.url,
      category: row.category_id ? (categoryName.get(row.category_id) ?? null) : null,
      notes: text,
      clips,
      ...handwriting(note?.pages),
      createdAt: row.created_at,
    };
  });

  // Reading and Tutorials may not be set up yet; then there are none.
  const articles: ReportSource[] = ((a.error ? [] : (a.data ?? [])) as ArticleRow[])
    .filter((row) => row.kind === "reading" || row.kind === "tutorial")
    .map((row) => {
      const { text, clips } = splitTypedClips(row.notes ?? "");
      return {
        kind: "article",
        id: row.id,
        section: row.kind as SourceSection,
        title: row.title || row.url,
        sub: row.site,
        url: row.url,
        category: row.category_id ? (categoryName.get(row.category_id) ?? null) : null,
        notes: text,
        clips,
        ...handwriting(row.pages),
        createdAt: row.created_at,
      };
    });

  // ScrapBook may not be set up yet; then there are none. A page's text is kept as HTML.
  const scraps: ReportSource[] = ((sc.error ? [] : (sc.data ?? [])) as ScrapRow[]).map((row) => ({
    kind: "scrap",
    id: row.id,
    section: "scrap",
    title: row.title || "Untitled page",
    sub: null,
    url: "",
    category: row.category_id ? (categoryName.get(row.category_id) ?? null) : null,
    notes: htmlToText(row.body ?? ""),
    clips: [],
    ...handwriting(row.pages),
    createdAt: row.created_at,
  }));

  return [...videos, ...articles, ...scraps].sort((x, y) => y.createdAt.localeCompare(x.createdAt));
}

// ---------- Building a report without AI ----------

// Puts each item's notes under its own heading, with its link and clips.
// `handwriting` is the text read from handwritten pages, by sourceKey.
export function compileReport(title: string, sources: ReportSource[], handwriting: Record<string, string> = {}) {
  const parts = [`# ${title}`];
  sources.forEach((s, i) => {
    const lines = [`## ${i + 1}. ${s.title}`];
    lines.push([SECTION_NAMES[s.section], s.sub, s.url].filter(Boolean).join(" · "));
    if (s.notes.trim()) lines.push("", s.notes.trim());
    if (s.clips.length) {
      lines.push("");
      for (const c of s.clips) lines.push(`![${c.t === null ? "" : `At ${formatTime(c.t)}`}](${c.path})`);
    }
    const hand = handwriting[sourceKey(s)]?.trim();
    if (hand) lines.push("", "### Handwritten notes", "", hand);
    else if (s.handPages) lines.push("", `(${s.handPages} handwritten page${s.handPages === 1 ? "" : "s"} not included. Use “Read handwriting” to add ${s.handPages === 1 ? "it" : "them"}.)`);
    if (!hasNotes(s)) lines.push("", "(No notes yet.)");
    parts.push(lines.join("\n"));
  });
  return parts.join("\n\n") + "\n";
}

// The list of sources added after an AI draft, numbered like the [1], [2] marks in it.
export function sourcesSection(list: { n: number; title: string; url: string }[]) {
  if (!list.length) return "";
  const name = (s: { title: string; url: string }) => {
    const title = s.title.replace(/[[\]]/g, "");
    // A ScrapBook page has no link, so just its name.
    return /^https?:\/\//.test(s.url) ? `[${title}](${s.url})` : `${title} (ScrapBook)`;
  };
  return "\n\n## Sources\n" + list.map((s) => `${s.n}. ${name(s)}`).join("\n");
}

// ---------- Reading the report text ----------
// Reports are plain text with a little markdown: # headings, - bullets, 1. steps,
// **bold**, _italic_ (or *italic*), ++underline++, [links](https://…), and ![caption](picture) on a line of its own.

export type Inline = { text: string; bold?: boolean; italic?: boolean; underline?: boolean; href?: string };
export type Block =
  | { type: "h1" | "h2" | "h3" | "p" | "li" | "quote"; inline: Inline[] }
  | { type: "ol"; num: string; inline: Inline[] }
  | { type: "img"; src: string; caption: string };

// Marks can sit inside each other, like a bold word in a link or bold italic text.
const INLINE =
  /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\*\*(.+?)\*\*|\+\+(.+?)\+\+|\*(?=\S)(.+?)(?<=\S)\*(?!\*)|(?<![\w/])_(?=\S)(.+?)(?<=\S)_(?!\w)|(https?:\/\/[^\s)]+)/g;

type Marks = Omit<Inline, "text">;

export function parseInline(text: string, marks: Marks = {}): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), ...marks });
    if (m[1] !== undefined) out.push(...parseInline(m[1], { ...marks, href: m[2] }));
    else if (m[3] !== undefined) out.push(...parseInline(m[3], { ...marks, bold: true }));
    else if (m[4] !== undefined) out.push(...parseInline(m[4], { ...marks, underline: true }));
    else if (m[5] !== undefined || m[6] !== undefined) out.push(...parseInline(m[5] ?? m[6], { ...marks, italic: true }));
    else out.push({ text: m[7], ...marks, href: m[7] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), ...marks });
  return out;
}

// Also reads clips the way notes store them: "[12:34] ![clip](path)".
const IMAGE_LINE = /^(?:\[([\d:]+)\]\s*)?!\[([^\]]*)\]\(([^)\s]+)\)$/;

export function parseReport(body: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const img = line.match(IMAGE_LINE);
    let m: RegExpMatchArray | null;
    if (img) {
      const caption = img[1] ? `At ${img[1]}` : img[2] === "clip" ? "" : img[2];
      blocks.push({ type: "img", src: img[3], caption });
    } else if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
      blocks.push({ type: (["h1", "h2", "h3"] as const)[m[1].length - 1], inline: parseInline(m[2]) });
    } else if ((m = line.match(/^[-*•]\s+(.*)$/))) {
      blocks.push({ type: "li", inline: parseInline(m[1]) });
    } else if ((m = line.match(/^(\d+)[.)]\s+(.*)$/))) {
      blocks.push({ type: "ol", num: m[1], inline: parseInline(m[2]) });
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      blocks.push({ type: "quote", inline: parseInline(m[1]) });
    } else {
      blocks.push({ type: "p", inline: parseInline(line) });
    }
  }
  return blocks;
}

// A clip is stored by its path in the clips bucket; a full link is used as it is.
export function pictureUrl(supabase: SupabaseClient, src: string) {
  return /^https?:\/\//.test(src) ? src : clipUrl(supabase, src);
}

export function fileName(title: string) {
  return (title.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "Report").slice(0, 100);
}

// A shared report, as anyone with its link sees it.
export type SharedReport = { title: string; body: string; updated_at: string };
