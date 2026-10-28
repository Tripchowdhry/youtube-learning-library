// Asks Google's Gemini about a YouTube video. Gemini watches the video itself from its
// link, so it sees the slides and screen as well as hearing what's said.
// Needs GEMINI_API_KEY (free from Google AI Studio); GEMINI_MODEL is optional.

// When a model is busy (Google's free tier often is) or missing, the next one is tried.
const MODELS = [
  ...(process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : []),
  // The newest Flash first. Its free plan allows only about 20 uses a day; after that Google
  // answers 429 and the next model is used.
  "gemini-3.8-flash",
  // Gemini 3.5 Flash is retired and Google sends it to 3.6 Flash, so that's asked for by name.
  "gemini-3.6-flash",
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

// A question about one moment only looks at this many seconds either side of it, at full detail.
export const FOCUS_SECONDS = 20;

// What part of the video to look at: all of it, or just around one moment (in seconds).
type Focus = { around: number } | null;

function videoMetadata(focus: Focus) {
  if (!focus) return { fps: FRAMES_PER_SECOND };
  return {
    start_offset: `${Math.max(0, focus.around - FOCUS_SECONDS)}s`,
    end_offset: `${focus.around + FOCUS_SECONDS}s`,
    fps: 1,
  };
}

async function callModel(
  model: string,
  videoUrl: string,
  instructions: string,
  request: string,
  focus: Focus,
  customFrames = true,
) {
  const video = {
    file_data: { file_uri: videoUrl },
    ...(customFrames ? { video_metadata: videoMetadata(focus) } : {}),
  };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: instructions }] },
      contents: [{ role: "user", parts: [video, { text: request }] }],
      // Low detail per frame keeps long videos inside the free tier's limits; a short
      // clip around one moment gets normal detail so text on screen can be read.
      ...(focus && customFrames ? {} : { generationConfig: { mediaResolution: "MEDIA_RESOLUTION_LOW" } }),
    }),
  });
  return { res, data: await res.json().catch(() => null) };
}

// "gemini-3.8-flash" -> "Gemini 3.8 Flash"
function modelName(id: string) {
  return id
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Returns the answer and the name of the Gemini model that wrote it.
export async function askAboutVideo(videoUrl: string, instructions: string, request: string, focus: Focus = null) {
  let lastStatus = 0;
  let lastDetail = "";
  for (const model of MODELS) {
    let { res, data } = await callModel(model, videoUrl, instructions, request, focus);
    // A model that doesn't accept a custom frame rate or clip gets the plain request instead.
    if (res.status === 400) ({ res, data } = await callModel(model, videoUrl, instructions, request, focus, false));
    if (res.ok) {
      const parts: { text?: string }[] = data?.candidates?.[0]?.content?.parts ?? [];
      const text = parts.map((p) => p.text ?? "").join("").trim();
      if (!text) throw new GeminiError("The AI didn't send an answer. Try asking a different way.", 502);
      return { text, model: modelName(data?.modelVersion || model) };
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
