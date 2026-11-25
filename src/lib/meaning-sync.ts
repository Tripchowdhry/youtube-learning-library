"use client";

// Search by meaning, in the browser. Keeps every saved item's meaning fingerprint up to date
// (new, changed and older items alike) quietly in the background while ⌘K is open, and asks for
// the items closest in meaning to a search. Turns itself off for the visit when the SQL hasn't
// been run or AI isn't set up, so nothing is shown and nothing breaks.

import type { Entry } from "@/components/FoundElsewhere";
import { MEANING_BATCH, meaningHash } from "@/lib/meaning";
import { createClient } from "@/lib/supabase/client";

// At most this many batches each time ⌘K opens, so a big library fills in over a few visits
// and stays well inside Gemini's free limits.
const BATCHES_PER_SYNC = 8;
// Don't check again for this long after a check.
const SYNC_GAP_MS = 2 * 60_000;

let off = false;
let syncing = false;
let lastSync = 0;

const keyOf = (kind: string, id: string) => `${kind}:${id}`;

export const meaningOff = () => off;

async function post(body: object) {
  const res = await fetch("/api/meaning", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (data?.off) off = true;
  return { ok: res.ok && !data?.off, data };
}

export async function syncMeanings(entries: Entry[]) {
  if (off || syncing || Date.now() - lastSync < SYNC_GAP_MS) return;
  syncing = true;
  lastSync = Date.now();
  try {
    const supabase = createClient();
    const { data, error } = await supabase.from("item_meanings").select("kind, item_id, source_hash").limit(10_000);
    if (error) {
      // The table isn't there yet: search by meaning is off until the SQL is run.
      off = true;
      return;
    }
    const have = new Map((data ?? []).map((r) => [keyOf(r.kind, r.item_id), r.source_hash as string]));

    // Fingerprints of items that were deleted (or moved tab) aren't needed any more.
    const live = new Set(entries.map((e) => keyOf(e.section, e.id)));
    const gone = (data ?? []).filter((r) => !live.has(keyOf(r.kind, r.item_id)));
    for (const kind of new Set(gone.map((r) => r.kind))) {
      const ids = gone.filter((r) => r.kind === kind).map((r) => r.item_id);
      for (let i = 0; i < ids.length; i += 200)
        await supabase
          .from("item_meanings")
          .delete()
          .eq("kind", kind)
          .in("item_id", ids.slice(i, i + 200));
    }

    const stale = entries
      .filter((e) => e.meaning || e.title !== "Untitled")
      .map((e) => ({
        kind: e.section,
        id: e.id,
        title: e.title,
        text: e.meaning || e.title,
        hash: meaningHash(e.title, e.meaning),
      }))
      .filter((i) => have.get(keyOf(i.kind, i.id)) !== i.hash);
    for (let b = 0; b < BATCHES_PER_SYNC && stale.length; b++) {
      const { ok } = await post({
        action: "index",
        items: stale.splice(0, MEANING_BATCH),
      });
      if (!ok) break;
    }
    // More left over: pick up from here next time.
    if (stale.length) lastSync = 0;
  } catch {
    // A quiet background job: it tries again next time.
  } finally {
    syncing = false;
  }
}

// The saved items closest in meaning to a search, best first, from the entries given.
// Only items clearly about the search: a floor on the score, and near the best one.
export async function searchMeaning(query: string, entries: Entry[]): Promise<Entry[]> {
  if (off) return [];
  try {
    const { ok, data } = await post({ action: "search", query });
    if (!ok) return [];
    const found: { kind: string; item_id: string; score: number }[] = Array.isArray(data?.matches) ? data.matches : [];
    const best = found[0]?.score ?? 0;
    const byKey = new Map(entries.map((e) => [keyOf(e.section, e.id), e]));
    return found
      .filter((m) => m.score >= 0.4 && m.score >= best - 0.12)
      .map((m) => byKey.get(keyOf(m.kind, m.item_id)))
      .filter((e): e is Entry => !!e);
  } catch {
    return [];
  }
}
