// Asks Google's Gemini about a YouTube video or an article. Gemini watches the video itself
// from its link, so it sees the slides and screen as well as hearing what's said.
// Needs GEMINI_API_KEY (free from Google AI Studio); GEMINI_MODEL is optional.

// When a model is busy (Google's free tier often is) or missing, the next one is tried.
const MODELS = [
  ...(process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : []),
  // Gemini 4 Hydrogen first: Google's newest everyday model (November 2026), smarter than
  // 3.8 Flash and free on the free plan. When its daily free uses run out, or it turns a
  // request down, Google answers 429/400 and the next model is used.
  "gemini-4-hydrogen",
  // The newest Flash next. Its free plan allows only about 20 uses a day.
  "gemini-3.8-flash",
  // Gemini 3.5 Flash is retired and Google sends it to 3.6 Flash, so that's asked for by name.
  "gemini-3.6-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash",
  "gemini-flash-lite-latest",
  "gemini-2.5-flash-lite",
].filter((m, i, all) => all.indexOf(m) === i);

// Busy (503), over the limit (429), not offered to this key (403, 404), or a request this model
// turns down even in its simple form (400, e.g. a newer model with different options): worth
// trying another model.
const TRY_NEXT = new Set([400, 403, 404, 429, 500, 503]);

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

function videoRequest(videoUrl: string, instructions: string, request: string, focus: Focus, customFrames: boolean) {
  const video = {
    file_data: { file_uri: videoUrl },
    ...(customFrames ? { video_metadata: videoMetadata(focus) } : {}),
  };
  return {
    systemInstruction: { parts: [{ text: instructions }] },
    contents: [{ role: "user", parts: [video, { text: request }] }],
    // Low detail per frame keeps long videos inside the free tier's limits; a short
    // clip around one moment gets normal detail so text on screen can be read.
    ...(focus && customFrames ? {} : { generationConfig: { mediaResolution: "MEDIA_RESOLUTION_LOW" } }),
  };
}

async function callModel(model: string, body: object) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
    body: JSON.stringify(body),
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

// Tries each model in turn. `body(true)` is the full request; a model that turns it down
// (400) is asked again with `body(false)`, a simpler one. `what` finishes "The AI couldn't…".
async function generate(body: (full: boolean) => object, what: string) {
  let lastStatus = 0;
  let lastDetail = "";
  for (const model of MODELS) {
    let { res, data } = await callModel(model, body(true));
    if (res.status === 400) ({ res, data } = await callModel(model, body(false)));
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
  throw new GeminiError(`The AI couldn't ${what} (${lastDetail}).`, 502);
}

// Returns the answer and the name of the Gemini model that wrote it.
// A model that doesn't accept a custom frame rate or clip gets the plain request instead.
export function askAboutVideo(videoUrl: string, instructions: string, request: string, focus: Focus = null) {
  return generate((full) => videoRequest(videoUrl, instructions, request, focus, full), "watch this video");
}

// Asks about an article. With its text, the text is sent; without (a login wall, an X post),
// Gemini is asked to open the link itself.
export function askAboutPage(url: string, pageText: string | null, instructions: string, request: string) {
  const system = { parts: [{ text: instructions }] };
  if (pageText) {
    return generate(
      () => ({ systemInstruction: system, contents: [{ role: "user", parts: [{ text: `${request}\n\nThe page (${url}):\n\n${pageText}` }] }] }),
      "read this page",
    );
  }
  return generate(
    () => ({
      systemInstruction: system,
      contents: [{ role: "user", parts: [{ text: `${request}\n\nThe page: ${url}` }] }],
      tools: [{ url_context: {} }],
    }),
    "read this page",
  );
}

// Files bigger than this are uploaded first, since a request can only carry about 20 MB.
const INLINE_MAX = 14_000_000;

type StoredFile = { name: string; uri: string; state?: string };

// Opens a one-time upload link so the browser can send a video from the computer straight to
// Gemini's file store (kept 48 hours) without it passing through BrainShelf. The key stays
// here: it goes in a header, so the link only carries an upload id. The display name tags
// the file with its owner, so only they can ask about it.
export async function startBrowserUpload(size: number, mimeType: string, owner: string) {
  const start = await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files", {
    method: "POST",
    headers: {
      "x-goog-api-key": process.env.GEMINI_API_KEY ?? "",
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(size),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: `brainshelf:${owner}` } }),
  });
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!start.ok || !uploadUrl) throw new GeminiError("The AI couldn't take the video right now. Try again.", 502);
  if (/[?&]key=/.test(uploadUrl)) throw new GeminiError("Direct upload isn't available.", 501);
  return uploadUrl;
}

// Asks about a video the browser sent to Gemini's file store, once Gemini has it ready.
export async function askAboutUploadedVideo(fileName: string, owner: string, instructions: string, request: string) {
  if (!/^files\/[\w-]+$/.test(fileName)) throw new GeminiError("That video isn't known.", 400);
  const key = process.env.GEMINI_API_KEY ?? "";
  const read = async () => {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}`, { headers: { "x-goog-api-key": key } });
    return res.ok ? ((await res.json().catch(() => null)) as (StoredFile & { displayName?: string; mimeType?: string }) | null) : null;
  };
  let file = await read();
  if (!file || file.displayName !== `brainshelf:${owner}`) throw new GeminiError("That video isn't yours, or it has expired.", 403);
  for (let i = 0; i < 100 && file?.state === "PROCESSING"; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    file = (await read()) ?? file;
  }
  if (file?.state === "PROCESSING") throw new GeminiError("The AI is still getting the video ready. Try again in a minute.", 504);
  if (file?.state === "FAILED") throw new GeminiError("The AI couldn't open this video. It may be damaged or in a format it can't read.", 422);
  const video = { file_data: { mime_type: file!.mimeType ?? "video/mp4", file_uri: file!.uri } };
  return generate(
    (full) => ({
      systemInstruction: { parts: [{ text: instructions }] },
      contents: [{ role: "user", parts: [full ? { ...video, video_metadata: { fps: FRAMES_PER_SECOND } } : video, { text: request }] }],
      generationConfig: { mediaResolution: "MEDIA_RESOLUTION_LOW" },
    }),
    "watch this video",
  );
}

// Puts a big file in Gemini's file store (kept 48 hours) and waits until it's ready.
async function uploadFile(bytes: Buffer, mimeType: string) {
  const key = process.env.GEMINI_API_KEY ?? "";
  const failed = () => new GeminiError("The file couldn't be sent to the AI. Try again.", 502);
  const start = await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files", {
    method: "POST",
    headers: {
      "x-goog-api-key": key,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.length),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: "BrainShelf file" } }),
  });
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!start.ok || !uploadUrl) throw failed();
  const done = await fetch(uploadUrl, {
    method: "POST",
    headers: { "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" },
    body: new Uint8Array(bytes),
  });
  const uploaded = (await done.json().catch(() => null))?.file as StoredFile | undefined;
  if (!done.ok || !uploaded) throw failed();
  let file: StoredFile = uploaded;
  for (let i = 0; i < 60 && file.state === "PROCESSING"; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${file.name}`, {
      headers: { "x-goog-api-key": key },
    });
    const latest = (await res.json().catch(() => null)) as StoredFile | null;
    if (latest) file = latest;
  }
  if (file.state === "FAILED") throw new GeminiError("The AI couldn't open this file. It may be damaged or protected.", 422);
  return file.uri;
}

// Asks about a PDF or text file, like a book saved in Dropbox.
export async function askAboutFile(file: { bytes: Buffer; mimeType: string }, instructions: string, request: string) {
  const system = { parts: [{ text: instructions }] };
  let part: object;
  if (file.mimeType === "text/plain") {
    part = { text: `The file:\n\n${file.bytes.toString("utf8").slice(0, 2_000_000)}` };
  } else if (file.bytes.length <= INLINE_MAX) {
    part = { inline_data: { mime_type: file.mimeType, data: file.bytes.toString("base64") } };
  } else {
    part = { file_data: { mime_type: file.mimeType, file_uri: await uploadFile(file.bytes, file.mimeType) } };
  }
  return generate(
    () => ({ systemInstruction: system, contents: [{ role: "user", parts: [part, { text: request }] }] }),
    "read this file",
  );
}
