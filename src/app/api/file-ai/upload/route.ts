import { NextResponse } from "next/server";
import { GeminiError, geminiConfigured, startBrowserUpload } from "@/lib/gemini";
import { createClient } from "@/lib/supabase/server";

// Google's limit for one file in Gemini's file store.
const MAX_BYTES = 2 * 1024 * 1024 * 1024;

// Gives the browser a one-time link to send a video from the computer straight to the AI.
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
  const size = Number(body.size);
  const type = String(body.type ?? "");
  if (!/^video\/[\w.+-]+$/.test(type)) return NextResponse.json({ error: "Only videos can be sent this way." }, { status: 415 });
  if (!(size > 0)) return NextResponse.json({ error: "The video looks empty." }, { status: 400 });
  if (size > MAX_BYTES) return NextResponse.json({ error: "The video is bigger than 2 GB, the AI's limit." }, { status: 413 });
  try {
    return NextResponse.json({ uploadUrl: await startBrowserUpload(size, type, user.id, request.headers.get("origin")) });
  } catch (e) {
    if (e instanceof GeminiError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "The AI couldn't be reached. Try again." }, { status: 502 });
  }
}
