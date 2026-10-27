import { NextResponse } from "next/server";
import { GeminiError, askAboutVideo, geminiConfigured } from "@/lib/gemini";
import { isSignedIn } from "@/lib/require-user";
import { parseYouTubeId, watchUrl } from "@/lib/youtube";

// Watching a long video can take a while.
export const maxDuration = 120;

const NOTE_MAX = 280;

// task "note": a short note for the library row. task "ask": answers the person's request for their notes.
export async function POST(request: Request) {
  if (!(await isSignedIn())) {
    return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  }
  if (!geminiConfigured()) {
    return NextResponse.json({ error: "AI isn't set up yet (GEMINI_API_KEY is missing).", code: "no-key" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const youtubeId = parseYouTubeId(String(body.youtubeId ?? ""));
  if (!youtubeId) {
    return NextResponse.json({ error: "That doesn't look like a YouTube video." }, { status: 400 });
  }
  const title = String(body.title ?? "").slice(0, 300);
  const about = title ? `The video is titled "${title}".` : "";

  try {
    if (body.task === "note") {
      const text = await askAboutVideo(
        watchUrl(youtubeId),
        `You write the short note shown next to a video in someone's learning library. ${about}`,
        `In one or two plain sentences, under ${NOTE_MAX - 30} characters, say what this video teaches and why it's worth watching. No markdown, no quotes, no emojis.`,
      );
      return NextResponse.json({ text: text.replace(/\s+/g, " ").slice(0, NOTE_MAX) });
    }

    const ask = String(body.prompt ?? "").trim().slice(0, 2000);
    if (!ask) return NextResponse.json({ error: "Type what you'd like the AI to do." }, { status: 400 });
    const text = await askAboutVideo(
      watchUrl(youtubeId),
      [
        `You help someone take study notes on a YouTube video. ${about}`,
        "Answer their request from what is said and shown in the video. If the video doesn't cover it, say so briefly.",
        "Your answer is pasted into a plain-text notes box, so don't use markdown: no **, #, or tables.",
        "Put short headings on their own line, use '- ' for bullet points and '1. ' for steps.",
        "Whenever you refer to a moment in the video, write its time in square brackets like [1:05] or [1:02:30].",
        "If they ask for a screenshot, describe what is on screen at that moment instead; the app adds the picture itself.",
      ].join("\n"),
      ask,
    );
    return NextResponse.json({ text });
  } catch (error) {
    if (error instanceof GeminiError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "The AI couldn't be reached. Try again." }, { status: 502 });
  }
}
