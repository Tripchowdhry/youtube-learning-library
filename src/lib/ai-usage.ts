// Saves a log of each AI request for the AI usage page: which model was asked, how long it took,
// how many tokens Google says it used, and whether it worked. Needs supabase/ai-usage.sql; until
// that's run, nothing is saved and the AI works as before.

import type { UsageRow } from "@/lib/gemini";
import { createClient } from "@/lib/supabase/server";

export async function saveUsage(rows: UsageRow[]) {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("ai_usage").insert(rows);
    if (error && !/ai_usage/.test(error.message)) console.error("Couldn't save AI usage", error.message);
  } catch (e) {
    console.error("Couldn't save AI usage", e);
  }
}
