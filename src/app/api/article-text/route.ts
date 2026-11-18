import { NextResponse } from "next/server";
import { readSavedArticle } from "@/lib/article-cache";
import { parseLink } from "@/lib/links";
import { createClient } from "@/lib/supabase/server";

// Gets an article's main text for the reading page. Only plain text is sent back
// (no HTML from the other site), so nothing from that site can run inside the app.
// The text is kept after the first read (see article-cache.ts).
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const link = (new URL(request.url).searchParams.get("url") ?? "").trim();
  const url = parseLink(link);
  if (!url) return NextResponse.json({ error: "That doesn't look like a web link." }, { status: 400 });

  return NextResponse.json(await readSavedArticle(supabase, link, url));
}
