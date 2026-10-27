// Browser side of /api/video-ai.

export type VideoAiResult = { text?: string; error?: string; code?: string };

export async function askVideoAi(body: {
  youtubeId: string;
  title?: string | null;
  task: "note" | "ask";
  prompt?: string;
}): Promise<VideoAiResult> {
  try {
    const res = await fetch("/api/video-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { text: data.text } : { error: data.error ?? "The AI couldn't answer.", code: data.code };
  } catch {
    return { error: "The AI couldn't be reached. Check your connection and try again." };
  }
}
