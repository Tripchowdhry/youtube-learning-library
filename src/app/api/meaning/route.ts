import { NextResponse } from "next/server";
import { GeminiError, aiRoute, embedTexts, geminiConfigured } from "@/lib/gemini";
import { MEANING_BATCH, MEANING_KINDS, MEANING_TEXT_MAX } from "@/lib/meaning";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

// Search by meaning (needs supabase/meaning-search.sql). Two jobs:
// { action: "index", items: [{ kind, id, hash, title, text }] } makes fingerprints for saved items
// and keeps them; { action: "search", query } finds the saved items closest in meaning to a search.
// Either answers { off: true } when the SQL hasn't been run, so the app carries on without it.
async function handle(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  if (!geminiConfigured()) return NextResponse.json({ off: true, error: "AI isn't set up yet (GEMINI_API_KEY is missing)." }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const missingTable = (message: string) => /item_meanings|match_item_meanings|vector/.test(message);

  try {
    if (body.action === "index") {
      const items = (Array.isArray(body.items) ? body.items : [])
        .map((i: Record<string, unknown>) => ({
          kind: String(i?.kind ?? ""),
          item_id: String(i?.id ?? "").slice(0, 100),
          source_hash: String(i?.hash ?? "").slice(0, 100),
          title: String(i?.title ?? "").slice(0, 300),
          text: String(i?.text ?? "").slice(0, MEANING_TEXT_MAX),
        }))
        .filter(
          (i: { kind: string; item_id: string; source_hash: string; text: string }) =>
            MEANING_KINDS.includes(i.kind) && i.item_id && i.source_hash && i.text.trim(),
        )
        .slice(0, MEANING_BATCH);
      if (!items.length) return NextResponse.json({ saved: 0 });
      const embeddings = await embedTexts(items, "item");
      const { error } = await supabase.from("item_meanings").upsert(
        items.map((i: { kind: string; item_id: string; source_hash: string }, n: number) => ({
          kind: i.kind,
          item_id: i.item_id,
          source_hash: i.source_hash,
          embedding: JSON.stringify(embeddings[n]),
          updated_at: new Date().toISOString(),
        })),
      );
      if (error) return missingTable(error.message) ? NextResponse.json({ off: true }) : NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ saved: items.length });
    }

    if (body.action === "search") {
      const query = String(body.query ?? "")
        .trim()
        .slice(0, 300);
      if (query.length < 3) return NextResponse.json({ matches: [] });
      const [embedding] = await embedTexts([{ text: query }], "query");
      const { data, error } = await supabase.rpc("match_item_meanings", {
        query_embedding: JSON.stringify(embedding),
        match_count: 20,
      });
      if (error) return missingTable(error.message) ? NextResponse.json({ off: true }) : NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ matches: data ?? [] });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    if (error instanceof GeminiError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Couldn't reach the AI. Try again." }, { status: 502 });
  }
}

export const POST = aiRoute(handle, "meaning");
