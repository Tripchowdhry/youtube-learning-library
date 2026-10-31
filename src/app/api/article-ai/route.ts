import { NextResponse } from "next/server";
import { readArticle } from "@/lib/article-text";
import { fetchFile, looksLikeFile, type FetchedFile } from "@/lib/fetch-file";
import { GeminiError, askAboutFile, askAboutPage, geminiConfigured } from "@/lib/gemini";
import { parseLink } from "@/lib/links";
import { isSignedIn } from "@/lib/require-user";

export const maxDuration = 300;

const NOTE_MAX = 280;
// Enough for a long article; the rest is left out.
const TEXT_MAX = 60_000;

// task "note" (the default): the short note shown next to an article or tutorial in the library.
// task "ask": answers the person's request for their study notes on the article.
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

  // A PDF or text file (like a book shared from Dropbox) is sent to the AI whole.
  let file: FetchedFile | null = null;
  let text: string | null = null;
  if (looksLikeFile(url)) {
    const result = await fetchFile(url);
    if (result && "error" in result) return NextResponse.json({ error: result.error }, { status: 422 });
    file = result;
  }
  if (!file) {
    const content = await readArticle(url);
    text = content.kind === "text" ? content.blocks.map((b) => b.text).join("\n").slice(0, TEXT_MAX) : null;
    if (!text) {
      // Some links to a PDF don't end in .pdf.
      const result = await fetchFile(url);
      if (result && !("error" in result)) file = result;
    }
  }
  const askAi = (instructions: string, request: string) =>
    file ? askAboutFile(file, instructions, request) : askAboutPage(url.toString(), text, instructions, request);

  try {
    if (body.task === "ask") {
      const ask = String(body.prompt ?? "").trim().slice(0, 2000);
      if (!ask) return NextResponse.json({ error: "Type what you'd like the AI to do." }, { status: 400 });
      const { text: answer, model } = await askAi(
        [
          `You help someone take study notes on a ${kind} they saved.${title ? ` It is titled "${title}".` : ""}`,
          `Answer their request from what the ${kind} says. If it doesn't cover it, say so briefly.`,
          "Your answer is pasted into a plain-text notes box, so don't use markdown: no **, #, or tables.",
          "Put short headings on their own line, use '- ' for bullet points and '1. ' for steps.",
        ].join("\n"),
        ask,
      );
      return NextResponse.json({ text: answer, model });
    }

    const { text: note, model } = await askAi(
      `You write the short note shown next to a saved ${kind} in someone's learning library.${title ? ` It is titled "${title}".` : ""}`,
      `In one or two plain sentences, under ${NOTE_MAX - 30} characters, say what this ${kind} teaches and why it's worth reading. No markdown, no quotes, no emojis.`,
    );
    return NextResponse.json({ text: note.replace(/\s+/g, " ").slice(0, NOTE_MAX), model });
  } catch (error) {
    if (error instanceof GeminiError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "The AI couldn't be reached. Try again." }, { status: 502 });
  }
}
