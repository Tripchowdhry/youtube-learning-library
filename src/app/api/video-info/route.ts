import { NextResponse } from "next/server";
import { parseYouTubeId, thumbnailUrl, watchUrl } from "@/lib/youtube";

// Looks up a video's title and channel from YouTube's public oEmbed endpoint,
// which needs no API key.
export async function GET(request: Request) {
  const input = new URL(request.url).searchParams.get("url") ?? "";
  const youtubeId = parseYouTubeId(input);
  if (!youtubeId) {
    return NextResponse.json({ error: "That doesn't look like a YouTube video link." }, { status: 400 });
  }

  const url = watchUrl(youtubeId);
  let title: string | null = null;
  let channel: string | null = null;
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, {
      next: { revalidate: 86400 },
    });
    if (res.ok) {
      const data = await res.json();
      title = data.title ?? null;
      channel = data.author_name ?? null;
    }
  } catch {
    // Fall through with an untitled video; the user can still save it.
  }

  return NextResponse.json({
    youtube_id: youtubeId,
    url,
    title: title ?? "Untitled video",
    channel,
    thumbnail_url: thumbnailUrl(youtubeId),
  });
}
