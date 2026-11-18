import { NextResponse } from "next/server";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config";

// Supabase pauses a free project after about a week with no activity. Vercel calls this once a
// day (see vercel.json) so the database always has some. It asks for one row as a visitor who
// isn't signed in, so the database answers but row-level security hands back nothing.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Vercel sends CRON_SECRET with its scheduled calls when that setting exists.
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  }
  if (!isSupabaseConfigured) return NextResponse.json({ error: "Supabase isn't set up." }, { status: 503 });

  const res = await fetch(`${supabaseUrl}/rest/v1/videos?select=id&limit=1`, {
    headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` },
    cache: "no-store",
  });
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 502 });
}
