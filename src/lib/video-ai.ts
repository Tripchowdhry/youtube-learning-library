// Browser side of /api/video-ai and /api/article-ai. Each model gets its own 5 minutes
// (see postAi); `onNote` hears when the next model is being tried.

import { postAi } from "@/lib/ai-request";

export type VideoAiResult = { text?: string; model?: string; error?: string; code?: string };

const UNREACHABLE = { error: "The AI couldn't be reached. Check your connection and try again." };

async function ask(url: string, body: Record<string, unknown>, signal?: AbortSignal, onNote?: (note: string) => void): Promise<VideoAiResult> {
  try {
    const { ok, status, data } = await postAi(url, body, { signal, onNote });
    if (ok) return { text: data.text as string | undefined, model: data.model as string | undefined };
    return { error: data.error ?? `The AI couldn't answer (error ${status}).`, code: data.code as string | undefined };
  } catch {
    return UNREACHABLE;
  }
}

export function askVideoAi(
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
  return ask("/api/video-ai", body, signal, onNote);
}

// A short note for an article or tutorial in the library.
// With task "ask", an answer to the person's request for their study notes.
export function askArticleAi(
  body: {
    url: string;
    title?: string | null;
    kind: string;
    task?: "note" | "ask";
    prompt?: string;
  },
  signal?: AbortSignal,
  onNote?: (note: string) => void,
): Promise<VideoAiResult> {
  return ask("/api/article-ai", body, signal, onNote);
}
