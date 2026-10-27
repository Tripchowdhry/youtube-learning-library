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
    if (res.ok) return { text: data.text };
    if (res.status === 504) {
      return { error: "The AI took too long (over 5 minutes). Very long videos can be too much for the free plan." };
    }
    return { error: data.error ?? `The AI couldn't answer (error ${res.status}).`, code: data.code };
  } catch {
    return { error: "The AI couldn't be reached. Check your connection and try again." };
  }
}
