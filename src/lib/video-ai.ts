// Browser side of /api/video-ai and /api/article-ai.

export type VideoAiResult = { text?: string; model?: string; error?: string; code?: string };

export async function askVideoAi(body: {
  youtubeId: string;
  title?: string | null;
  task: "note" | "ask";
  prompt?: string;
  focusAt?: number;
}): Promise<VideoAiResult> {
  try {
    const res = await fetch("/api/video-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { text: data.text, model: data.model };
    if (res.status === 504) {
      return { error: "The AI took too long (over 5 minutes). Very long videos can be too much for the free plan." };
    }
    return { error: data.error ?? `The AI couldn't answer (error ${res.status}).`, code: data.code };
  } catch {
    return { error: "The AI couldn't be reached. Check your connection and try again." };
  }
}

// A short note for an article or tutorial in the library.
export async function askArticleAi(body: { url: string; title?: string | null; kind: string }): Promise<VideoAiResult> {
  try {
    const res = await fetch("/api/article-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { text: data.text, model: data.model };
    if (res.status === 504) return { error: "The AI took too long. Try again in a minute." };
    return { error: data.error ?? `The AI couldn't answer (error ${res.status}).`, code: data.code };
  } catch {
    return { error: "The AI couldn't be reached. Check your connection and try again." };
  }
}
