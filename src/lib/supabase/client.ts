import { createBrowserClient } from "@supabase/ssr";
import { countingFetch } from "@/lib/bandwidth";
import { supabaseAnonKey, supabaseUrl } from "./config";

export function createClient() {
  // countingFetch counts each answer's size for the Bandwidth part of the AI usage page.
  return createBrowserClient(supabaseUrl, supabaseAnonKey, { global: { fetch: countingFetch } });
}
