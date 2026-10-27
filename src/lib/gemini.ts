// Asks Google's Gemini about a YouTube video. Gemini watches the video itself from its
// link, so it sees the slides and screen as well as hearing what's said.
// Needs GEMINI_API_KEY (free from Google AI Studio); GEMINI_MODEL is optional.

const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";

export class GeminiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export function geminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

export async function askAboutVideo(videoUrl: string, instructions: string, request: string) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: instructions }] },
      contents: [{ role: "user", parts: [{ file_data: { file_uri: videoUrl } }, { text: request }] }],
      // Low detail per frame keeps long videos inside the free tier's limits.
      generationConfig: { mediaResolution: "MEDIA_RESOLUTION_LOW" },
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 429) {
      throw new GeminiError("The free AI limit is used up for now. Try again in a minute, or tomorrow.", 429);
    }
    const detail = data?.error?.message ?? `error ${res.status}`;
    throw new GeminiError(`The AI couldn't watch this video (${detail}).`, 502);
  }
  const parts: { text?: string }[] = data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => p.text ?? "").join("").trim();
  if (!text) throw new GeminiError("The AI didn't send an answer. Try asking a different way.", 502);
  return text;
}
