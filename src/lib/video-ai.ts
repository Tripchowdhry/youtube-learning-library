// Browser side of /api/video-ai and /api/article-ai.

export type VideoAiResult = { text?: string; model?: string; error?: string; code?: string };

// The models are tried one at a time, one request each, so every model gets its own 5 minutes
// (Vercel ends a request after 5). `onNote` hears when the next model is being tried.
export async function askVideoAi(
  body: {
    youtubeId: string;
    title?: string | null;
    task: "note" | "ask";
    prompt?: string;
    focusAt?: number;
  },
  signal?: AbortSignal,
  onNote?: (note: string) => void,
): Promise<VideoAiResult> {
  const errors: { status: number; error: string; code?: string }[] = [];
  for (let attempt = 0; attempt < 10; attempt++) {
    let res: Response;
    try {
      res = await fetch("/api/video-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, attempt }),
        signal,
      });
    } catch {
      return { error: "The AI couldn't be reached. Check your connection and try again." };
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { text: data.text, model: data.model };
    // Vercel's own 5-minute cut-off comes back without our answer: count it as this model being slow.
    const slow = res.status === 504;
    errors.push({
      status: res.status,
      error: data.error ?? (slow ? SLOW_MESSAGE : `The AI couldn't answer (error ${res.status}).`),
      code: data.code,
    });
    if (!(data.tryNext || (slow && !data.error && attempt < 4)) || signal?.aborted) break;
    onNote?.(slow ? "That AI model was slow, trying another one…" : "Trying another AI model…");
  }
  // The message that matters most: a used-up free limit, then slowness, then the last reason.
  const pick =
    errors.find((e) => e.status === 429) ?? errors.find((e) => e.status === 504) ?? errors[errors.length - 1];
  return { error: pick?.error ?? "The AI couldn't answer.", code: pick?.code };
}

const SLOW_MESSAGE = "The AI took too long (over 5 minutes). Very long videos can be too much for the free plan.";

// A short note for an article or tutorial in the library.
// With task "ask", an answer to the person's request for their study notes.
export async function askArticleAi(body: {
  url: string;
  title?: string | null;
  kind: string;
  task?: "note" | "ask";
  prompt?: string;
}, signal?: AbortSignal): Promise<VideoAiResult> {
  try {
    const res = await fetch("/api/article-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { text: data.text, model: data.model };
    if (res.status === 504) return { error: "The AI took too long. Try again in a minute." };
    return { error: data.error ?? `The AI couldn't answer (error ${res.status}).`, code: data.code };
  } catch {
    return { error: "The AI couldn't be reached. Check your connection and try again." };
  }
}
