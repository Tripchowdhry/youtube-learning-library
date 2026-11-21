import { NextResponse } from "next/server";
import { GeminiError, aiRoute, askAboutFile, geminiConfigured } from "@/lib/gemini";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 120;

// Report Writer: rewrites one part of a report (Shorter, Clearer or Expand). Nothing is saved here;
// the report page shows the new version and only uses it if the person chooses Replace.

const HOW = {
  shorter: "Make this part shorter and tighter. Keep every key point, and drop repetition and filler.",
  clearer: "Make this part clearer and easier to read: simpler words, shorter sentences, a clear order. Keep its length about the same.",
  expand:
    "Expand this part: explain its points more fully, and add a short example where it helps. Use only what this part and the rest of the report say; don't add new facts.",
} as const;

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
  const how = (Object.keys(HOW) as (keyof typeof HOW)[]).find((k) => k === body.how);
  const part = String(body.text ?? "").trim().slice(0, 20_000);
  const report = String(body.report ?? "").trim().slice(0, 60_000);
  if (!how) return NextResponse.json({ error: "Choose Shorter, Clearer or Expand." }, { status: 400 });
  if (!part) return NextResponse.json({ error: "Select some text in the report first." }, { status: 400 });

  const instructions = [
    "You help someone edit a report they wrote from their own study notes. You rewrite only the part they picked.",
    "Keep the same meaning and the same facts. Keep every source mark like [1] or [2][3] with the point it belongs to.",
    "Keep the same kind of formatting the part already uses: '## ' or '### ' headings, '- ' bullet points, '1. ' steps, **bold**, _italic_, [links](https://…).",
    "Reply with only the new version of the part, nothing before or after it, and no title.",
  ].join("\n");
  const file = `${report ? `The whole report, for context:\n\n${report}\n\n=====\n\n` : ""}The part to rewrite:\n\n${part}`;

  try {
    const { text, model } = await askAboutFile({ bytes: Buffer.from(file, "utf8"), mimeType: "text/plain" }, instructions, HOW[how]);
    const out = String(text ?? "").trim();
    if (!out) return NextResponse.json({ error: "The AI didn't send anything back. Try again." }, { status: 502 });
    return NextResponse.json({ text: out, model });
  } catch (error) {
    if (error instanceof GeminiError) return NextResponse.json({ error: error.message, tryNext: error.tryNext }, { status: error.status });
    return NextResponse.json({ error: "Couldn't reach the AI. Try again." }, { status: 502 });
  }
}

// body.attempt picks one model per request, so each model gets its own 5 minutes.
export const POST = aiRoute(handle);
