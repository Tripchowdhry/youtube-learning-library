import { NextResponse } from "next/server";
import { GeminiError, askAboutFile, geminiConfigured } from "@/lib/gemini";
import { FILES_BUCKET, aiReadable, fileType } from "@/lib/files";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 300;

// Answers a request about a file attached to a ScrapBook page. The file is read with the
// person's own sign-in, so only their own files can be asked about.
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
  if (!path.startsWith(`${user.id}/`)) return NextResponse.json({ error: "That file isn't yours." }, { status: 403 });
  if (!ask) return NextResponse.json({ error: "Type what you'd like the AI to do." }, { status: 400 });
  const type = fileType({ name, type: String(body.type ?? "") });
  if (!aiReadable({ name, type })) {
    return NextResponse.json({ error: "Ask AI works with PDFs, pictures and text files." }, { status: 415 });
  }

  const { data, error } = await supabase.storage.from(FILES_BUCKET).download(path);
  if (error || !data) return NextResponse.json({ error: "The file couldn't be found. It may have been deleted." }, { status: 404 });
  const bytes = Buffer.from(await data.arrayBuffer());

  try {
    const { text, model } = await askAboutFile(
      { bytes, mimeType: type === "text/markdown" ? "text/plain" : type },
      [
        `You help someone take notes on a file they keep in their ScrapBook, named "${name}".`,
        "Answer their request from what the file says. If it doesn't cover it, say so briefly.",
        "Keep formatting simple: '## ' for a short heading, '- ' for bullet points, '1. ' for steps,",
        "and **bold** only for a few key words. No tables.",
      ].join("\n"),
      ask,
    );
    return NextResponse.json({ text, model });
  } catch (e) {
    if (e instanceof GeminiError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "The AI couldn't be reached. Try again." }, { status: 502 });
  }
}
