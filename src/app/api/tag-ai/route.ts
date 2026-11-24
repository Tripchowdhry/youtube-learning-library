import { NextResponse } from "next/server";
import { cleanAiTags, AI_TAGS_MAX } from "@/lib/ai-tags";
import { GeminiError, aiRoute, askAboutFile, geminiConfigured } from "@/lib/gemini";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const KINDS: Record<string, string> = {
  video: "a YouTube video",
  article: "a saved web article",
  tutorial: "a saved tutorial",
  scrap: "a page from their notebook",
  report: "a report they wrote",
};

// AI tags: picks up to 3 short tags for one item from its title and a little text, reusing the
// person's existing tags where they fit. Small on purpose, so it stays well inside the free plan.
// Body: { kind, title, about?, text?, existing?: string[] }. Nothing is saved here; the page saves it.
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
  const kind = KINDS[String(body.kind)] ? String(body.kind) : "article";
  const title = String(body.title ?? "").trim().slice(0, 300);
  const about = String(body.about ?? "").trim().slice(0, 300);
  const text = String(body.text ?? "").trim().slice(0, 3_000);
  const existing = (Array.isArray(body.existing) ? body.existing : [])
    .map((t: unknown) => String(t).trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 200);
  if (!title && !text) return NextResponse.json({ tags: [] });

  const instructions = [
    `You add tags to ${KINDS[kind]} in someone's learning library, so they can find it again later.`,
    `Give 1 to ${AI_TAGS_MAX} tags for the main topics. Fewer good tags beat more vague ones.`,
    "Each tag is 1 to 3 words, lower case, a topic (like: react, machine learning, history), not a format or a feeling.",
    "Never use words like video, article, tutorial, notes, report, learning or interesting as tags.",
    existing.length
      ? "When one of their existing tags fits, use it exactly as written instead of making a similar new one."
      : "",
    "Reply with only the tags, separated by commas, nothing else.",
  ]
    .filter(Boolean)
    .join("\n");
  const item = [
    `Title: ${title || "(none)"}`,
    about ? `From: ${about}` : "",
    text ? `Text:\n${text}` : "",
    existing.length ? `\nTheir existing tags: ${existing.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const { text: answer, model } = await askAboutFile({ bytes: Buffer.from(item, "utf8"), mimeType: "text/plain" }, instructions, "Tags:");
    return NextResponse.json({ tags: cleanAiTags(String(answer ?? ""), existing), model });
  } catch (error) {
    if (error instanceof GeminiError) return NextResponse.json({ error: error.message, tryNext: error.tryNext }, { status: error.status });
    return NextResponse.json({ error: "Couldn't reach the AI. Try again." }, { status: 502 });
  }
}

export const POST = aiRoute(handle, "tags");
