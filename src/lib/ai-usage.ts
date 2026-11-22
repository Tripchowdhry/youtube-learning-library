// Saves a log of each AI request for the AI usage page: which model was asked, how long it took,
// how many tokens Google says it used, and whether it worked. Needs supabase/ai-usage.sql; until
// that's run, nothing is saved and the AI works as before. Rows older than 30 days, which the
// page never shows, are deleted each time new ones are saved.

import type { UsageRow } from "@/lib/gemini";
import { createClient } from "@/lib/supabase/server";

export const KEEP_DAYS = 30;

export async function saveUsage(rows: UsageRow[]) {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("ai_usage").insert(rows);
    if (error) {
      if (!/ai_usage/.test(error.message)) console.error("Couldn't save AI usage", error.message);
      return;
    }
    const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString();
    const old = await supabase.from("ai_usage").delete().lt("created_at", cutoff);
    if (old.error) console.error("Couldn't clear old AI usage", old.error.message);
  } catch (e) {
    console.error("Couldn't save AI usage", e);
  }
}
