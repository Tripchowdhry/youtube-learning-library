// Browser side of every AI request. Vercel ends a request after 5 minutes, so the AI models
// are asked one request at a time (body.attempt 0, 1, 2…): each model gets its own 5 minutes,
// and when one is busy, out of free uses or too slow, the next one is asked.

export const SLOW_MESSAGE = "The AI took over 5 minutes. Try something smaller.";

export type AiResponse = { ok: boolean; status: number; data: Record<string, unknown> & { error?: string } };

// Hears what an AI request is doing: `onNote` when the next model is being tried, `onModel`
// with the name of the model working on it now (e.g. "Gemini 4 Hydrogen").
export type AiHooks = { onNote?: (note: string) => void; onModel?: (model: string) => void };

// The models in the order they're asked, by name. Read once per visit.
let modelNames: Promise<string[]> | null = null;
function aiModelNames() {
  modelNames ??= fetch("/api/ai-models")
    .then((res) => (res.ok ? res.json() : {}))
    .then((data: { models?: string[] }) => data.models ?? [])
    .catch(() => []);
  return modelNames.then((names) => {
    // Couldn't be read: ask again next time.
    if (!names.length) modelNames = null;
    return names;
  });
}

export async function postAi(
  url: string,
  body: Record<string, unknown>,
  options: AiHooks & {
    signal?: AbortSignal;
    // Changes to the request before the next model is asked, from the last answer.
    nextBody?: (data: Record<string, unknown>) => Record<string, unknown>;
  } = {},
): Promise<AiResponse> {
  const tries: AiResponse[] = [];
  let request = body;
  for (let attempt = 0; attempt < 10; attempt++) {
    if (options.onModel) {
      const name = (await aiModelNames())[attempt];
      if (name) options.onModel(name);
    }
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...request, attempt }),
      signal: options.signal,
    });
    const data = (await res.json().catch(() => ({}))) as AiResponse["data"];
    if (res.ok) return { ok: true, status: res.status, data };
    // Vercel's own 5-minute cut-off comes back without our answer: count it as this model being slow.
    const cutOff = res.status === 504 && !data.error;
    tries.push({ ok: false, status: res.status, data: cutOff ? { ...data, error: SLOW_MESSAGE } : data });
    if (options.signal?.aborted || !(data.tryNext || (cutOff && attempt < 4))) break;
    options.onNote?.(res.status === 504 ? "Too slow, trying another model…" : "Trying another model…");
    if (options.nextBody) request = { ...request, ...options.nextBody(data) };
  }
  // The answer that matters most: a used-up free limit, then slowness, then the last reason.
  return tries.find((t) => t.status === 429) ?? tries.find((t) => t.status === 504) ?? tries[tries.length - 1];
}
