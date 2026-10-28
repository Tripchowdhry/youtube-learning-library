import { NextResponse } from "next/server";
import { readArticle } from "@/lib/article-text";
import { GeminiError, askAboutPage, geminiConfigured } from "@/lib/gemini";
import { parseLink } from "@/lib/links";
import { isSignedIn } from "@/lib/require-user";

export const maxDuration = 120;

const NOTE_MAX = 280;
// Enough for a long article; the rest is left out.
const TEXT_MAX = 60_000;

// Writes the short note shown next to an article or tutorial in the library.
export async function POST(request: Request) {
  if (!(await isSignedIn())) {
    return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  }
  if (!geminiConfigured()) {
    return NextResponse.json({ error: "AI isn't set up yet (GEMINI_API_KEY is missing).", code: "no-key" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const url = parseLink(String(body.url ?? ""));
  if (!url) return NextResponse.json({ error: "That doesn't look like a web link." }, { status: 400 });
  const title = String(body.title ?? "").slice(0, 300);
  const kind = body.kind === "tutorial" ? "tutorial" : "article";

  const content = await readArticle(url);
  const text = content.kind === "text" ? content.blocks.map((b) => b.text).join("\n").slice(0, TEXT_MAX) : null;

  try {
    const { text: note, model } = await askAboutPage(
      url.toString(),
      text,
      `You write the short note shown next to a saved ${kind} in someone's learning library.${title ? ` It is titled "${title}".` : ""}`,
      `In one or two plain sentences, under ${NOTE_MAX - 30} characters, say what this ${kind} teaches and why it's worth reading. No markdown, no quotes, no emojis.`,
    );
    return NextResponse.json({ text: note.replace(/\s+/g, " ").slice(0, NOTE_MAX), model });
  } catch (error) {
    if (error instanceof GeminiError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "The AI couldn't be reached. Try again." }, { status: 502 });
  }
}
