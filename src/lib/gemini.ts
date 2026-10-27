// Asks Google's Gemini about a YouTube video. Gemini watches the video itself from its
// link, so it sees the slides and screen as well as hearing what's said.
// Needs GEMINI_API_KEY (free from Google AI Studio); GEMINI_MODEL is optional.

// When a model is busy (Google's free tier often is) or missing, the next one is tried.
const MODELS = [
  ...(process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : []),
  "gemini-flash-latest",
  "gemini-2.5-flash",
  "gemini-flash-lite-latest",
  "gemini-2.5-flash-lite",
].filter((m, i, all) => all.indexOf(m) === i);

// Busy (503), over the limit (429), or not offered to this key (404): worth trying another model.
const TRY_NEXT = new Set([404, 429, 500, 503]);

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

// Gemini normally looks at one frame per second. One frame every 3 seconds (with all the
// audio) still catches slides and code, and makes long videos much quicker.
const FRAMES_PER_SECOND = 1 / 3;

async function callModel(model: string, videoUrl: string, instructions: string, request: string, fewerFrames = true) {
  const video = {
    file_data: { file_uri: videoUrl },
    ...(fewerFrames ? { video_metadata: { fps: FRAMES_PER_SECOND } } : {}),
  };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: instructions }] },
      contents: [{ role: "user", parts: [video, { text: request }] }],
      // Low detail per frame keeps long videos inside the free tier's limits.
      generationConfig: { mediaResolution: "MEDIA_RESOLUTION_LOW" },
    }),
  });
  return { res, data: await res.json().catch(() => null) };
}

export async function askAboutVideo(videoUrl: string, instructions: string, request: string) {
  let lastStatus = 0;
  let lastDetail = "";
  for (const model of MODELS) {
    let { res, data } = await callModel(model, videoUrl, instructions, request);
    // A model that doesn't accept a custom frame rate gets the plain request instead.
    if (res.status === 400) ({ res, data } = await callModel(model, videoUrl, instructions, request, false));
    if (res.ok) {
      const parts: { text?: string }[] = data?.candidates?.[0]?.content?.parts ?? [];
      const text = parts.map((p) => p.text ?? "").join("").trim();
      if (!text) throw new GeminiError("The AI didn't send an answer. Try asking a different way.", 502);
      return text;
    }
    lastStatus = res.status;
    lastDetail = data?.error?.message ?? `error ${res.status}`;
    console.error("Gemini request failed", model, res.status, lastDetail);
    if (!TRY_NEXT.has(res.status)) break;
  }
  if (lastStatus === 429) {
    throw new GeminiError("The free AI limit is used up for now. Try again in a minute, or tomorrow.", 429);
  }
  if (lastStatus === 503 || lastStatus === 500) {
    throw new GeminiError("Google's free AI is busy right now. Please try again in a minute.", 503);
  }
  throw new GeminiError(`The AI couldn't watch this video (${lastDetail}).`, 502);
}
