import { NextResponse } from "next/server";
import { readArticle } from "@/lib/article-text";
import { parseLink } from "@/lib/links";
import { isSignedIn } from "@/lib/require-user";

// Gets an article's main text for the reading page. Only plain text is sent back
// (no HTML from the other site), so nothing from that site can run inside the app.
export async function GET(request: Request) {
  if (!(await isSignedIn())) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const url = parseLink(new URL(request.url).searchParams.get("url") ?? "");
  if (!url) return NextResponse.json({ error: "That doesn't look like a web link." }, { status: 400 });

  return NextResponse.json(await readArticle(url));
}
