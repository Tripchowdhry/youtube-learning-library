import { NextResponse } from "next/server";
import { splitTypedClips } from "@/lib/clips";
import { GeminiError, askAboutFile, geminiConfigured } from "@/lib/gemini";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 300;

// Report Writer's AI draft. Reads the chosen videos' and articles' notes (read-only, and only the
// signed-in person's own, through the database's own rules) and asks Gemini to write one report.
// Nothing is saved here; the report page saves the draft into the reports table.
// With mode "title" it suggests a few titles instead, from the same notes and the report text so far.

const MAX_SOURCES = 60;
// Per item and in total, so a request stays well inside what the AI accepts.
const NOTES_MAX = 40_000;
const TOTAL_MAX = 600_000;

type Wanted = { kind: "video" | "article"; id: string };

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  if (!geminiConfigured()) {
    return NextResponse.json({ error: "AI isn't set up yet (GEMINI_API_KEY is missing).", code: "no-key" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const title = String(body.title ?? "").trim().slice(0, 200) || "Report";
  const focus = String(body.prompt ?? "").trim().slice(0, 2000);
  const titleMode = body.mode === "title";
  // The report text so far, used only for title ideas.
  const reportText = titleMode ? String(body.body ?? "").trim().slice(0, 30_000) : "";
  const wanted: Wanted[] = (Array.isArray(body.sources) ? body.sources : [])
    .filter((s: Wanted) => (s?.kind === "video" || s?.kind === "article") && typeof s.id === "string")
    .slice(0, MAX_SOURCES);
  if (!wanted.length && !reportText) {
    return NextResponse.json({ error: "Choose at least one video, reading or tutorial first." }, { status: 400 });
  }

  const videoIds = wanted.filter((s) => s.kind === "video").map((s) => s.id);
  const articleIds = wanted.filter((s) => s.kind === "article").map((s) => s.id);
  const none = { data: [], error: null };
  const [v, n, a] = await Promise.all([
    videoIds.length ? supabase.from("videos").select("id, title, channel, url").in("id", videoIds) : none,
    videoIds.length ? supabase.from("notes").select("video_id, text").in("video_id", videoIds) : none,
    articleIds.length ? supabase.from("articles").select("*").in("id", articleIds) : none,
  ]);
  const failed = v.error ?? n.error ?? a.error;
  if (failed) return NextResponse.json({ error: failed.message }, { status: 500 });

  const videos = new Map((v.data ?? []).map((r) => [r.id as string, r]));
  const notes = new Map((n.data ?? []).map((r) => [r.video_id as string, (r.text as string) ?? ""]));
  const articles = new Map((a.data ?? []).map((r) => [r.id as string, r]));

  // The notes, numbered in the order the person chose. Items without typed notes are left out.
  const used: { n: number; title: string; url: string }[] = [];
  const parts: string[] = [];
  let total = 0;
  for (const s of wanted) {
    const row = s.kind === "video" ? videos.get(s.id) : articles.get(s.id);
    if (!row) continue;
    const saved = s.kind === "video" ? (notes.get(s.id) ?? "") : ((row.notes as string | null) ?? "");
    const text = splitTypedClips(saved).text.trim().slice(0, NOTES_MAX);
    if (!text || total + text.length > TOTAL_MAX) continue;
    total += text.length;
    const num = used.length + 1;
    const itemTitle = (row.title as string | null) || (row.url as string);
    const type =
      s.kind === "video"
        ? `Video${row.channel ? ` by ${row.channel}` : ""}`
        : `${row.kind === "tutorial" ? "Tutorial" : "Reading"}${row.site ? ` from ${row.site}` : ""}`;
    used.push({ n: num, title: itemTitle, url: row.url as string });
    parts.push(`[${num}] ${itemTitle}\n${type}\nLink: ${row.url}\nNotes:\n${text}`);
  }
  if (titleMode) return suggestTitles(parts, reportText);
  if (!used.length) {
    return NextResponse.json(
      { error: "None of the chosen items have typed notes yet, so there's nothing for the AI to work from." },
      { status: 400 },
    );
  }

  const instructions = [
    "You write reports from someone's own study notes, taken on videos, articles and tutorials saved in their learning library.",
    "Use only what the notes say. Don't add facts from elsewhere; if the notes leave a gap or disagree, say so briefly.",
    "Show where each point comes from with the source's number in square brackets, like [2] or [1][3].",
    "Format: '## ' for section headings, '### ' for smaller ones, '- ' for bullet points, '1. ' for steps, **bold** for key terms.",
    "No tables. Don't write the report's title or a list of sources at the end; both are added for you.",
  ].join("\n");
  const ask =
    (focus || "Write a clear, well-organised report that brings these notes together. Start with a short summary, then group the main ideas by theme.") +
    `\n\nThe report is titled "${title}". The notes are in the file, one item after another, each with its number.`;

  try {
    const { text, model } = await askAboutFile(
      { bytes: Buffer.from(parts.join("\n\n---\n\n"), "utf8"), mimeType: "text/plain" },
      instructions,
      ask,
    );
    return NextResponse.json({ text, model, sources: used });
  } catch (error) {
    if (error instanceof GeminiError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "The AI couldn't be reached. Try again." }, { status: 502 });
  }
}

// Three short title ideas, one per line, from the notes and the report text so far.
async function suggestTitles(parts: string[], reportText: string) {
  if (!parts.length && !reportText) {
    return NextResponse.json(
      { error: "There's nothing to base a title on yet. Choose items with typed notes, or write some of the report first." },
      { status: 400 },
    );
  }
  const file = [reportText && `The report so far:\n${reportText}`, parts.length && `The notes it draws on:\n\n${parts.join("\n\n---\n\n")}`]
    .filter(Boolean)
    .join("\n\n=====\n\n");
  const instructions = [
    "You suggest titles for a report someone is writing from their own study notes.",
    "Give exactly 3 different titles, one per line, with nothing else: no numbers, quotes, bullets or explanations.",
    "Each title is clear and specific to what the notes cover, at most 10 words, in title case.",
  ].join("\n");
  try {
    const { text } = await askAboutFile(
      { bytes: Buffer.from(file, "utf8"), mimeType: "text/plain" },
      instructions,
      "Suggest 3 titles for this report.",
    );
    const titles = String(text ?? "")
      .split("\n")
      .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").replace(/^["'“”*_]+|["'“”*_]+$/g, "").trim())
      .filter((line) => line && line.length <= 150)
      .slice(0, 3);
    if (!titles.length) return NextResponse.json({ error: "The AI didn't suggest any titles. Try again." }, { status: 502 });
    return NextResponse.json({ titles });
  } catch (error) {
    if (error instanceof GeminiError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "The AI couldn't be reached. Try again." }, { status: 502 });
  }
}
