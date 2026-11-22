import { NextResponse } from "next/server";
import { readSavedArticle } from "@/lib/article-cache";
import { MAX_ITEMS, MAX_WATCHED_VIDEOS, type ChatItemKind, type ChatSource, type ChatTurn } from "@/lib/category-chat";
import { splitTypedClips } from "@/lib/clips";
import { GeminiError, aiRoute, askAboutSources, geminiConfigured, type SourcePart } from "@/lib/gemini";
import { htmlToText } from "@/lib/html-text";
import { parseLink } from "@/lib/links";
import { createClient } from "@/lib/supabase/server";
import { watchUrl } from "@/lib/youtube";

// Watching several videos can take a while.
export const maxDuration = 300;

// Text limits, so one question stays inside the free plan: per article, per set of notes, and
// for all the articles together.
const ARTICLE_MAX = 25_000;
const NOTES_MAX = 8_000;
const ARTICLES_TOTAL = 150_000;
const HISTORY_TURNS = 3;

type Item = { source: ChatSource; parts: SourcePart[] };

const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}\n[…cut short]` : text);
const ownNotes = (text: string) => splitTypedClips(text ?? "").text.trim();

// Ask this category: answers one question from the items the person picked in a category,
// and says which item each part came from.
// Body: { kind: "video" | "article" | "scrap", ids: string[], category: string, question: string, history?: ChatTurn[] }
async function handle(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  if (!geminiConfigured()) {
    return NextResponse.json({ error: "AI isn't set up yet (GEMINI_API_KEY is missing).", code: "no-key" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const kind: ChatItemKind = body.kind === "article" ? "article" : body.kind === "scrap" ? "scrap" : "video";
  const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter((id: string) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, MAX_ITEMS);
  const question = String(body.question ?? "").trim().slice(0, 2000);
  const category = String(body.category ?? "").slice(0, 200);
  const history: ChatTurn[] = (Array.isArray(body.history) ? body.history : [])
    .slice(-HISTORY_TURNS)
    .map((t: ChatTurn) => ({ q: String(t?.q ?? "").slice(0, 2000), a: String(t?.a ?? "").slice(0, 6000) }));
  if (!question) return NextResponse.json({ error: "Type a question first." }, { status: 400 });
  if (!ids.length) return NextResponse.json({ error: "There's nothing in this category to ask about yet." }, { status: 400 });

  let items: Item[];
  try {
    items = await gather(supabase, kind, ids);
  } catch {
    return NextResponse.json({ error: "BrainShelf couldn't read this category. Try again." }, { status: 500 });
  }
  if (!items.length) return NextResponse.json({ error: "There's nothing in this category to ask about yet." }, { status: 400 });

  const what = kind === "video" ? "videos" : kind === "article" ? "saved articles" : "notebook pages";
  const instructions = [
    `You answer questions about the ${what} in someone's learning library${category ? `, in their category "${category}"` : ""}.`,
    "Below are their numbered sources. Answer only from these sources. If they don't cover the question, say so in one sentence.",
    "After each fact, name its source by number in square brackets, like [2].",
    ...(kind === "video"
      ? ["When a fact comes from a moment in a video, add the time like this: [2 @ 4:12] (or [2 @ 1:02:30]). Use the real time in that video."]
      : []),
    "Use one bracket per source; for two sources write [1] [3].",
    "Keep it short and simple, for a learner. Plain text: short paragraphs, '- ' for bullet points, '1. ' for steps.",
    "You may put a few key words in **bold**. No headings with #, no tables.",
    "If they ask to be quizzed, ask numbered questions first, then give the answers under the line 'Answers:', each with its source.",
  ].join("\n");

  const parts: SourcePart[] = items.flatMap((i) => i.parts);
  const earlier = history.length
    ? `Earlier in this chat:\n${history.map((t) => `Question: ${t.q}\nYour answer: ${t.a}`).join("\n\n")}\n\n`
    : "";

  try {
    const { text, model } = await askAboutSources(parts, instructions, `${earlier}Question: ${question}`);
    return NextResponse.json({ text, model, sources: items.map((i) => i.source) });
  } catch (error) {
    if (error instanceof GeminiError) {
      // Too much to watch or read in one free request.
      if (/token|too large|exceeds|payload/i.test(error.message)) {
        return NextResponse.json(
          { error: "Too much for the free AI. Tap Choose… and pick fewer items." },
          { status: 413 },
        );
      }
      return NextResponse.json({ error: error.message, tryNext: error.tryNext }, { status: error.status });
    }
    return NextResponse.json({ error: "Couldn't reach the AI. Try again." }, { status: 502 });
  }
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Reads the picked items (only the person's own, through row level security) and turns each
// into numbered parts for the AI, in the order they were picked.
async function gather(supabase: Supabase, kind: ChatItemKind, ids: string[]): Promise<Item[]> {
  const order = (id: string) => ids.indexOf(id);

  if (kind === "video") {
    const [v, n] = await Promise.all([
      supabase.from("videos").select("id, youtube_id, title, channel, note").in("id", ids),
      supabase.from("notes").select("video_id, text").in("video_id", ids),
    ]);
    if (v.error) throw v.error;
    const notes = new Map((n.data ?? []).map((row) => [row.video_id as string, ownNotes(row.text as string)]));
    const rows = (v.data ?? []).sort((a, b) => order(a.id) - order(b.id));
    return rows.map((row, i) => {
      const n = i + 1;
      const title = row.title || "Untitled video";
      const watched = i < MAX_WATCHED_VIDEOS;
      const about = [
        `Source [${n}]: the video "${title}"${row.channel ? ` by ${row.channel}` : ""}.`,
        watched ? "It is the video right after this line." : "Only its title and the person's notes are given here.",
        row.note ? `Their short note on it: ${row.note}` : "",
        notes.get(row.id) ? `Their notes on it:\n${cut(notes.get(row.id)!, NOTES_MAX)}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      const parts: SourcePart[] = [{ text: about }];
      if (watched) parts.push({ video: watchUrl(row.youtube_id) });
      return { source: { n, kind, id: row.id, title }, parts };
    });
  }

  if (kind === "article") {
    const { data, error } = await supabase.from("articles").select("*").in("id", ids);
    if (error) throw error;
    const rows = (data ?? []).sort((a, b) => order(a.id) - order(b.id));
    let budget = ARTICLES_TOTAL;
    // Texts are read together; most come straight from the saved copy.
    const texts = await Promise.all(
      rows.map(async (row) => {
        const url = parseLink(row.url ?? "");
        if (!url) return "";
        const content = await readSavedArticle(supabase, row.url, url).catch(() => null);
        return content?.kind === "text" ? content.blocks.map((b) => b.text).join("\n") : "";
      }),
    );
    return rows.map((row, i) => {
      const n = i + 1;
      const title = row.title || row.url;
      const text = cut(texts[i], Math.min(ARTICLE_MAX, Math.max(0, budget)));
      budget -= text.length;
      const about = [
        `Source [${n}]: "${title}"${row.site ? ` from ${row.site}` : ""} (${row.url}).`,
        row.note ? `Their short note on it: ${row.note}` : "",
        row.notes?.trim() ? `Their notes on it:\n${cut(ownNotes(row.notes), NOTES_MAX)}` : "",
        text.trim() ? `The text:\n${text}` : "Its text couldn't be read; only the title and notes are given.",
      ]
        .filter(Boolean)
        .join("\n");
      return { source: { n, kind, id: row.id, title }, parts: [{ text: about }] };
    });
  }

  const { data, error } = await supabase.from("scraps").select("id, title, body").in("id", ids);
  if (error) throw error;
  const rows = (data ?? []).sort((a, b) => order(a.id) - order(b.id));
  return rows.map((row, i) => {
    const n = i + 1;
    const title = row.title || "Untitled";
    const text = cut(htmlToText(row.body ?? ""), ARTICLE_MAX);
    return {
      source: { n, kind, id: row.id, title },
      parts: [{ text: `Source [${n}]: their notebook page "${title}".\n${text || "(Only handwriting, no typed text.)"}` }],
    };
  });
}

// body.attempt picks one model per request, so each model gets its own 5 minutes.
export const POST = aiRoute(handle, "category");
