// Ask this category: one question across every video, reading, tutorial or ScrapBook page in a
// category. The answer names its sources as [2] or, for a moment in a video, [2 @ 4:12].
// This file is shared by the server route and the chat screen, so it has no server-only parts.

export type ChatItemKind = "video" | "article" | "scrap";

// One item the AI may answer from, numbered from 1 in the order it was sent.
export type ChatSource = { n: number; kind: ChatItemKind; id: string; title: string };

// An earlier question and answer, sent along so follow-ups make sense.
export type ChatTurn = { q: string; a: string };

// At most this many items go into one question (the rest of a big category is left out).
export const MAX_ITEMS = 30;
// Videos are watched from their links; past this many, only their titles and notes are sent,
// so one question stays inside the free plan.
export const MAX_WATCHED_VIDEOS = 5;

// A piece of an answer line: plain text, bold text, or a citation.
export type Segment =
  | { type: "text"; text: string; bold?: boolean }
  | { type: "cite"; n: number; t: number | null };

// "4:12" or "1:02:30" -> seconds.
export function parseTime(text: string): number | null {
  const parts = text.split(":").map((p) => Number(p));
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !Number.isFinite(p) || p < 0)) return null;
  return parts.reduce((total, p) => total * 60 + p, 0);
}

// [2], [2 @ 4:12], [2, 3] and [1 @ 0:40; 3] are all citations.
const CITE = /\[(\s*\d+(?:\s*@\s*\d{1,2}(?::\d{2}){1,2})?(?:\s*[,;]\s*\d+(?:\s*@\s*\d{1,2}(?::\d{2}){1,2})?)*\s*)\]/g;

// Splits one line of an answer into text, **bold** text and citations. Citations to a number
// that isn't a source are dropped.
export function parseLine(line: string, sourceCount: number): Segment[] {
  const out: Segment[] = [];
  const pushText = (text: string) => {
    const pieces = text.split(/\*\*/);
    pieces.forEach((piece, i) => {
      if (piece) out.push({ type: "text", text: piece, bold: i % 2 === 1 });
    });
  };
  let last = 0;
  for (const m of line.matchAll(CITE)) {
    pushText(line.slice(last, m.index));
    for (const one of m[1].split(/[,;]/)) {
      const [num, time] = one.split("@").map((s) => s.trim());
      const n = Number(num);
      if (n >= 1 && n <= sourceCount) out.push({ type: "cite", n, t: time ? parseTime(time) : null });
    }
    last = m.index! + m[0].length;
  }
  pushText(line.slice(last));
  // A space left before a dropped or moved citation looks odd at the end of a line.
  const end = out[out.length - 1];
  if (end?.type === "text") end.text = end.text.replace(/\s+$/, "");
  return out;
}

// The sources an answer actually cites, in number order, each with the first video time cited.
export function citedSources(answer: string, sources: ChatSource[]) {
  const times = new Map<number, number | null>();
  for (const line of answer.split("\n")) {
    for (const seg of parseLine(line, sources.length)) {
      if (seg.type !== "cite") continue;
      if (!times.has(seg.n) || (times.get(seg.n) === null && seg.t !== null)) times.set(seg.n, seg.t);
    }
  }
  return sources.filter((s) => times.has(s.n)).map((s) => ({ ...s, t: times.get(s.n) ?? null }));
}

// Where a source opens in BrainShelf. A video opens at the cited moment.
export function sourceHref(source: { kind: ChatItemKind; id: string }, t: number | null = null) {
  if (source.kind === "video") return `/video/${source.id}${t !== null ? `?t=${Math.floor(t)}` : ""}`;
  if (source.kind === "article") return `/read/${source.id}`;
  return `/scrap/${source.id}`;
}

// The answer as plain text, with citations shown as (Video title, 4:12), for copying and saving.
export function answerAsText(answer: string, sources: ChatSource[]) {
  const time = (t: number) => {
    const s = Math.floor(t);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
  };
  const lines = answer.split("\n").map((line) =>
    parseLine(line, sources.length)
      .map((seg) => {
        if (seg.type === "text") return seg.bold ? `**${seg.text}**` : seg.text;
        const s = sources[seg.n - 1];
        return ` (${s.title}${seg.t !== null ? `, ${time(seg.t)}` : ""})`;
      })
      .join("")
      .replace(/[ \t]+\(/g, " ("),
  );
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// The question and answer as a ScrapBook page body (simple HTML).
export function answerAsHtml(question: string, answer: string, sources: ChatSource[]) {
  const html: string[] = [`<p><em>${escapeHtml(question)}</em></p>`];
  let list: string[] = [];
  const flush = () => {
    if (list.length) html.push(`<ul>${list.join("")}</ul>`);
    list = [];
  };
  for (const raw of answerAsText(answer, sources).split("\n")) {
    const line = raw.trim();
    const inline = (s: string) => escapeHtml(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      list.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }
    flush();
    if (line) html.push(`<p>${inline(line)}</p>`);
  }
  flush();
  return html.join("");
}

// The question and answer as lines to add to the end of a report.
export function answerAsReport(question: string, answer: string, sources: ChatSource[]) {
  return `## ${question.replace(/\s+/g, " ").trim()}\n\n${answerAsText(answer, sources)}`;
}
