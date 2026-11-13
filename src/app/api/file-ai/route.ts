import { NextResponse } from "next/server";
import { GeminiError, askAboutFile, askAboutUploadedVideo, geminiConfigured, uploadVideoInPieces } from "@/lib/gemini";
import { FILES_BUCKET, aiReadable, fileType } from "@/lib/files";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 300;

// Answers a request about a file attached to a ScrapBook page. The file is read with the
// person's own sign-in, so only their own files can be asked about.
// A video kept on the computer comes one of two ways: already sent by the browser to the AI's
// file store (geminiFile), or put in a temporary Supabase folder that is emptied afterwards.
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
  const path = String(body.path ?? "");
  const name = String(body.name ?? "file").slice(0, 200);
  const ask = String(body.prompt ?? "").trim().slice(0, 2000);
  if (!ask) return NextResponse.json({ error: "Type what you'd like the AI to do." }, { status: 400 });
  const instructions = [
    `You help someone take notes on a file they keep in their ScrapBook, named "${name}".`,
    "Answer their request from what the file says. If it doesn't cover it, say so briefly.",
    "Keep formatting simple: '## ' for a short heading, '- ' for bullet points, '1. ' for steps,",
    "and **bold** only for a few key words. No tables.",
  ].join("\n");

  // The backup route: a video in pieces in the person's temporary folder. They're passed on to
  // the AI one by one and deleted, whatever happens.
  const parts: string[] = Array.isArray(body.parts) ? body.parts.map(String) : [];
  if (parts.length) {
    if (!parts.every((p) => p.startsWith(`${user.id}/tmp/`))) {
      return NextResponse.json({ error: "That file isn't yours." }, { status: 403 });
    }
    const size = Number(body.size);
    try {
      const geminiFile = await uploadVideoInPieces(size, String(body.type ?? "video/mp4"), user.id, async function* () {
        for (const part of parts) {
          const { data, error } = await supabase.storage.from(FILES_BUCKET).download(part);
          if (error || !data) throw new GeminiError("Part of the video went missing on the way. Try again.", 404);
          yield Buffer.from(await data.arrayBuffer());
        }
      });
      await supabase.storage.from(FILES_BUCKET).remove(parts);
      const { text, model } = await askAboutUploadedVideo(geminiFile, user.id, instructions, ask);
      return NextResponse.json({ text, model });
    } catch (e) {
      await supabase.storage.from(FILES_BUCKET).remove(parts);
      if (e instanceof GeminiError) return NextResponse.json({ error: e.message }, { status: e.status });
      return NextResponse.json({ error: "The AI couldn't be reached. Try again." }, { status: 502 });
    }
  }

  if (body.geminiFile) {
    try {
      const { text, model } = await askAboutUploadedVideo(String(body.geminiFile), user.id, instructions, ask);
      return NextResponse.json({ text, model });
    } catch (e) {
      if (e instanceof GeminiError) return NextResponse.json({ error: e.message }, { status: e.status });
      return NextResponse.json({ error: "The AI couldn't be reached. Try again." }, { status: 502 });
    }
  }

  if (!path.startsWith(`${user.id}/`)) return NextResponse.json({ error: "That file isn't yours." }, { status: 403 });
  // Only files in the temporary folder are removed after the answer.
  const temporary = path.startsWith(`${user.id}/tmp/`);
  const type = fileType({ name, type: String(body.type ?? "") });
  if (!aiReadable({ name, type })) {
    return NextResponse.json({ error: "Ask AI works with PDFs, pictures and text files." }, { status: 415 });
  }

  const { data, error } = await supabase.storage.from(FILES_BUCKET).download(path);
  if (temporary) await supabase.storage.from(FILES_BUCKET).remove([path]);
  if (error || !data) return NextResponse.json({ error: "The file couldn't be found. It may have been deleted." }, { status: 404 });
  const bytes = Buffer.from(await data.arrayBuffer());

  try {
    const { text, model } = await askAboutFile({ bytes, mimeType: type === "text/markdown" ? "text/plain" : type }, instructions, ask);
    return NextResponse.json({ text, model });
  } catch (e) {
    if (e instanceof GeminiError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "The AI couldn't be reached. Try again." }, { status: 502 });
  }
}
