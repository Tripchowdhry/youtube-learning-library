import { NextResponse } from "next/server";
import { GeminiError, aiRoute, askAboutFile, geminiConfigured } from "@/lib/gemini";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 120;

// Report Writer: reads the writing on one handwritten notes page. The page is drawn into a picture
// in the browser and sent here; the AI turns it into text. Nothing is saved here; the report page
// shows the text for checking and keeps it with the report. The notes themselves are never changed.

// About 3 MB of picture, sent as base64.
const MAX_BASE64 = 4_000_000;

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
  const image = typeof body.image === "string" ? body.image : "";
  if (!image || image.length > MAX_BASE64 || !/^[A-Za-z0-9+/=]+$/.test(image)) {
    return NextResponse.json({ error: "This page couldn't be turned into a picture to read." }, { status: 400 });
  }

  const instructions = [
    "You transcribe handwritten study notes from a picture of one notebook page.",
    "Write out exactly what is written, in reading order. Don't summarise, correct or add anything.",
    "Keep the person's line breaks and lists: start bullet points with '- ' and numbered steps with '1. '.",
    "If a word can't be read, write [?] in its place. Describe a drawing or diagram in a few words in square brackets, like [diagram: arrow from A to B].",
    "Reply with only the text, nothing before or after it. If the page has no writing, reply with nothing.",
  ].join("\n");

  try {
    const { text, model } = await askAboutFile(
      { bytes: Buffer.from(image, "base64"), mimeType: "image/png" },
      instructions,
      "Transcribe the handwriting on this page.",
    );
    return NextResponse.json({ text: String(text ?? "").trim(), model });
  } catch (error) {
    if (error instanceof GeminiError) return NextResponse.json({ error: error.message, tryNext: error.tryNext }, { status: error.status });
    return NextResponse.json({ error: "Couldn't reach the AI. Try again." }, { status: 502 });
  }
}

// body.attempt picks one model per request, so each model gets its own 5 minutes.
export const POST = aiRoute(handle, "handwriting");
