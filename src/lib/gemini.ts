// Asks Google's Gemini about a YouTube video or an article. Gemini watches the video itself
// from its link, so it sees the slides and screen as well as hearing what's said.
// Needs GEMINI_API_KEY (free from Google AI Studio); GEMINI_MODEL is optional.

import { AsyncLocalStorage } from "node:async_hooks";
import { geminiModels, looksRetired, modelRetired } from "./gemini-models";

// One AI request's details: which model to ask, when the browser goes through the models one
// request at a time (so each one gets its own 5 minutes), and a log of every model asked, for the
// AI usage page. Set by withModelAttempt or aiRoute; without an attempt, every model is tried in
// turn within the one request.
export type UsageRow = {
  feature: string;
  model: string;
  status: number;
  ok: boolean;
  ms: number;
  input_tokens: number;
  output_tokens: number;
  handed_off: boolean;
};
type RequestStore = { attempt?: number; feature: string; usage: UsageRow[] };
const requestStore = new AsyncLocalStorage<RequestStore>();

const asAttempt = (attempt: unknown) =>
  Number.isInteger(attempt) && (attempt as number) >= 0
    ? (attempt as number)
    : undefined;

// Runs a route's work for one model attempt: body.attempt 0 is the first model, 1 the next…
// An answer that says tryNext means the browser should ask again with the next number.
export function withModelAttempt<T>(
  attempt: unknown,
  work: () => Promise<T>,
  usage: UsageRow[] = [],
  feature = "other",
): Promise<T> {
  return requestStore.run(
    { attempt: asAttempt(attempt), feature, usage },
    work,
  );
}

// Wraps a POST route so it takes part in model attempts (see withModelAttempt), and saves which
// models it asked, how long they took and how many tokens they used (see ai-usage.ts).
// `feature` names it on the AI usage page, e.g. "video".
export function aiRoute(
  handler: (request: Request) => Promise<Response>,
  feature: string,
) {
  return async (request: Request) => {
    const body = await request
      .clone()
      .json()
      .catch(() => ({}));
    const usage: UsageRow[] = [];
    const response = await withModelAttempt(
      (body as { attempt?: unknown })?.attempt,
      () => handler(request),
      usage,
      feature,
    );
    if (usage.length) {
      const { saveUsage } = await import("./ai-usage");
      await saveUsage(usage);
    }
    return response;
  };
}

// Which models to try, and in what order, comes from gemini-models.ts: Google's own list,
// checked once a day, with a fixed list as the backup. When one is busy or missing, the next
// one is tried.

// Busy (503), over the limit (429), not offered to this key (403, 404), or a request this model
// turns down even in its simple form (400, e.g. a newer model with different options): worth
// trying another model.
const TRY_NEXT = new Set([400, 403, 404, 429, 500, 503]);

export class GeminiError extends Error {
  constructor(
    message: string,
    public status: number,
    // True when another model might still answer (this one was busy, out of uses, slow…).
    public tryNext = false,
  ) {
    super(message);
  }
}

// Each model gets up to 5 minutes to answer before the next one is tried. Vercel ends a
// request after 5 minutes, so the wait is a little shorter, leaving time to answer cleanly.
export const MODEL_TIME_LIMIT_MS = 285_000;
const SLOW = 504;

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

function videoRequest(
  videoUrl: string,
  instructions: string,
  request: string,
  focus: Focus,
  customFrames: boolean,
) {
  const video = {
    file_data: { file_uri: videoUrl },
    ...(customFrames ? { video_metadata: videoMetadata(focus) } : {}),
  };
  return {
    systemInstruction: { parts: [{ text: instructions }] },
    contents: [{ role: "user", parts: [video, { text: request }] }],
    // Low detail per frame keeps long videos inside the free tier's limits; a short
    // clip around one moment gets normal detail so text on screen can be read.
    ...(focus && customFrames
      ? {}
      : { generationConfig: { mediaResolution: "MEDIA_RESOLUTION_LOW" } }),
  };
}

async function callModel(model: string, body: object, deadline: number) {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY ?? "",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(Math.max(1000, deadline - Date.now())),
      },
    );
    return { res, data: await res.json().catch(() => null) };
  } catch (error) {
    // Out of time: this model is too slow today, so the next one gets a turn.
    if (
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      return {
        res: new Response(null, { status: SLOW }),
        data: { error: { message: "took too long" } },
      };
    }
    throw error;
  }
}

// "gemini-3.8-flash" -> "Gemini 3.8 Flash"
export function modelName(id: string) {
  return id
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Tries each model in turn (or one, see withModelAttempt). `body(true)` is the full request; a model
// that turns it down (400) is asked again with `body(false)`, a simpler one. `what` finishes
// "The AI couldn't…". Each model has up to MODEL_TIME_LIMIT_MS to answer.
async function generate(body: (full: boolean) => object, what: string) {
  // Every model's failure is kept, so the message shown is the one that matters (a used-up
  // free limit, or why the main model failed) and not just whatever the last backup said.
  const failures: { model: string; status: number; detail: string }[] = [];
  // One attempt of several: only that model is asked, and tryNext says if there's another.
  const store = requestStore.getStore();
  const attempt = store?.attempt;
  let models = await geminiModels();
  let hasNext = true;
  if (attempt !== undefined) {
    if (attempt >= models.length)
      throw new GeminiError(
        "No other AI model is free. Try again in a minute.",
        503,
      );
    hasNext = attempt + 1 < models.length;
    models = [models[attempt]];
  }
  for (const model of models) {
    const started = Date.now();
    const deadline = started + MODEL_TIME_LIMIT_MS;
    let { res, data } = await callModel(model, body(true), deadline);
    if (res.status === 400)
      ({ res, data } = await callModel(model, body(false), deadline));
    // Still turned down: try once more without the extra settings (such as low detail per frame).
    if (res.status === 400)
      ({ res, data } = await callModel(
        model,
        withoutSettings(body(false)),
        deadline,
      ));
    const parts: { text?: string }[] = res.ok
      ? (data?.candidates?.[0]?.content?.parts ?? [])
      : [];
    const text = parts
      .map((p) => p.text ?? "")
      .join("")
      .trim();
    store?.usage.push(
      usageRow(
        store.feature,
        model,
        res.ok && !text ? 502 : res.status,
        started,
        data?.usageMetadata,
      ),
    );
    if (res.ok) {
      if (!text)
        throw new GeminiError(
          "The AI didn't send an answer. Try asking a different way.",
          502,
        );
      return { text, model: modelName(data?.modelVersion || model) };
    }
    const detail = data?.error?.message ?? `error ${res.status}`;
    failures.push({ model, status: res.status, detail });
    // Retired since the list was last checked: skip it from now on and get a fresh list.
    if (looksRetired(res.status, detail)) modelRetired(model);
    console.error("Gemini request failed", model, res.status, detail);
    if (!TRY_NEXT.has(res.status) && res.status !== SLOW) break;
  }
  // Worth asking another model, if the caller goes through them one at a time.
  const tryNext =
    hasNext &&
    failures.length > 0 &&
    failures.every((f) => TRY_NEXT.has(f.status) || f.status === SLOW);
  const last = store?.usage[store.usage.length - 1];
  if (last && tryNext) last.handed_off = true;
  if (failures.some((f) => f.status === 429)) {
    throw new GeminiError(
      "The free AI limit is used up. Try again later.",
      429,
      tryNext,
    );
  }
  if (failures.some((f) => f.status === 503 || f.status === 500)) {
    throw new GeminiError(
      "The AI is busy. Try again in a minute.",
      503,
      tryNext,
    );
  }
  if (failures.some((f) => f.status === SLOW)) {
    throw new GeminiError(
      "The AI took over 5 minutes. Try something shorter.",
      SLOW,
      tryNext,
    );
  }
  // A model that's gone or not offered to this key (404, 403) says little; the first other
  // failure explains more.
  const main =
    failures.find((f) => f.status !== 404 && f.status !== 403) ?? failures[0];
  throw new GeminiError(
    `The AI couldn't ${what} (${main ? `${modelName(main.model)}: ${main.detail}` : "no model answered"}).`,
    502,
    tryNext,
  );
}

type UsageMetadata = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
};

function usageRow(
  feature: string,
  model: string,
  status: number,
  started: number,
  meta?: UsageMetadata,
): UsageRow {
  return {
    feature,
    model: modelName(model),
    status,
    ok: status >= 200 && status < 300,
    ms: Date.now() - started,
    input_tokens: meta?.promptTokenCount ?? 0,
    // The answer, plus the thinking a model does before it answers (also counted by Google).
    output_tokens:
      (meta?.candidatesTokenCount ?? 0) + (meta?.thoughtsTokenCount ?? 0),
    handed_off: false,
  };
}

function withoutSettings(body: object) {
  const rest: Record<string, unknown> = { ...body };
  delete rest.generationConfig;
  return rest;
}

// Returns the answer and the name of the Gemini model that wrote it.
// A model that doesn't accept a custom frame rate or clip gets the plain request instead.
export function askAboutVideo(
  videoUrl: string,
  instructions: string,
  request: string,
  focus: Focus = null,
) {
  return generate(
    (full) => videoRequest(videoUrl, instructions, request, focus, full),
    "watch this video",
  );
}

// Asks about an article. With its text, the text is sent; without (a login wall, an X post),
// Gemini is asked to open the link itself.
export function askAboutPage(
  url: string,
  pageText: string | null,
  instructions: string,
  request: string,
) {
  const system = { parts: [{ text: instructions }] };
  if (pageText) {
    return generate(
      () => ({
        systemInstruction: system,
        contents: [
          {
            role: "user",
            parts: [
              { text: `${request}\n\nThe page (${url}):\n\n${pageText}` },
            ],
          },
        ],
      }),
      "read this page",
    );
  }
  return generate(
    () => ({
      systemInstruction: system,
      contents: [
        { role: "user", parts: [{ text: `${request}\n\nThe page: ${url}` }] },
      ],
      tools: [{ url_context: {} }],
    }),
    "read this page",
  );
}

// Files bigger than this are uploaded first, since a request can only carry about 20 MB.
const INLINE_MAX = 14_000_000;

type StoredFile = { name: string; uri: string; state?: string };

// Gemini names some types its own way (a .mov is "video/quicktime" in the browser).
export function geminiVideoType(type: string) {
  return (
    (
      {
        "video/quicktime": "video/mov",
        "video/x-msvideo": "video/avi",
        "video/x-ms-wmv": "video/wmv",
        "text/markdown": "text/plain",
      } as Record<string, string>
    )[type] ?? type
  );
}

// Opens a resumable upload in Gemini's file store (kept 48 hours). The display name tags the
// file with its owner, so only they can ask about it. The key goes in a header, so the
// returned link carries only an upload id.
async function startUpload(
  size: number,
  mimeType: string,
  owner: string,
  origin?: string,
) {
  const start = await fetch(
    "https://generativelanguage.googleapis.com/upload/v1beta/files",
    {
      method: "POST",
      headers: {
        "x-goog-api-key": process.env.GEMINI_API_KEY ?? "",
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(size),
        "X-Goog-Upload-Header-Content-Type": geminiVideoType(mimeType),
        "Content-Type": "application/json",
        // Google's upload server only lets a browser send to the link from the site that opened it.
        ...(origin ? { Origin: origin } : {}),
      },
      body: JSON.stringify({ file: { display_name: `brainshelf:${owner}` } }),
    },
  );
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!start.ok || !uploadUrl) {
    console.error(
      "Gemini upload start failed",
      start.status,
      await start.text().catch(() => ""),
    );
    throw new GeminiError(
      "The AI couldn't take the video right now. Try again.",
      502,
    );
  }
  const granularity =
    Number(start.headers.get("x-goog-upload-chunk-granularity")) ||
    8 * 1024 * 1024;
  return { uploadUrl, granularity };
}

// A one-time link for the browser to send a video from the computer straight to Gemini.
export async function startBrowserUpload(
  size: number,
  mimeType: string,
  owner: string,
  origin: string | null,
) {
  const { uploadUrl } = await startUpload(
    size,
    mimeType,
    owner,
    origin ?? undefined,
  );
  if (/[?&]key=/.test(uploadUrl))
    throw new GeminiError("Direct upload isn't available.", 501);
  return uploadUrl;
}

// Sends a video to Gemini from pieces read one after another (the backup route, from a
// temporary Supabase folder). Google takes it in chunks of its chosen size; the last one ends it.
export async function uploadVideoInPieces(
  size: number,
  mimeType: string,
  owner: string,
  pieces: () => AsyncGenerator<Buffer>,
) {
  const { uploadUrl, granularity } = await startUpload(size, mimeType, owner);
  const failed = () =>
    new GeminiError("The video couldn't be sent to the AI. Try again.", 502);
  const chunk = Math.max(
    granularity,
    Math.floor((16 * 1024 * 1024) / granularity) * granularity,
  );
  let pending = Buffer.alloc(0);
  let offset = 0;
  const send = async (bytes: Buffer, last: boolean) => {
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "X-Goog-Upload-Offset": String(offset),
        "X-Goog-Upload-Command": last ? "upload, finalize" : "upload",
      },
      body: new Uint8Array(bytes),
    });
    if (!res.ok) {
      console.error(
        "Gemini chunk upload failed",
        res.status,
        await res.text().catch(() => ""),
      );
      throw failed();
    }
    offset += bytes.length;
    return last
      ? ((await res.json().catch(() => null))?.file?.name as string | undefined)
      : undefined;
  };
  for await (const piece of pieces()) {
    pending = Buffer.concat([pending, piece]);
    while (pending.length > chunk) {
      await send(pending.subarray(0, chunk), false);
      pending = pending.subarray(chunk);
    }
  }
  const name = await send(pending, true);
  if (!name) throw failed();
  return name;
}

// Asks about a file (a video, PDF, picture or text) the browser sent to Gemini's file store,
// once Gemini has it ready.
export async function askAboutUploadedFile(
  fileName: string,
  owner: string,
  instructions: string,
  request: string,
) {
  if (!/^files\/[\w-]+$/.test(fileName))
    throw new GeminiError("That video isn't known.", 400);
  const key = process.env.GEMINI_API_KEY ?? "";
  const read = async () => {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileName}`,
      { headers: { "x-goog-api-key": key } },
    );
    return res.ok
      ? ((await res.json().catch(() => null)) as
          | (StoredFile & { displayName?: string; mimeType?: string })
          | null)
      : null;
  };
  let file = await read();
  if (!file || file.displayName !== `brainshelf:${owner}`)
    throw new GeminiError("That video isn't yours, or it has expired.", 403);
  for (let i = 0; i < 100 && file?.state === "PROCESSING"; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    file = (await read()) ?? file;
  }
  if (file?.state === "PROCESSING")
    throw new GeminiError(
      "The AI is still getting the file ready. Try again in a minute.",
      504,
    );
  if (file?.state === "FAILED")
    throw new GeminiError(
      "The AI couldn't open this file. It may be damaged or in a format it can't read.",
      422,
    );
  const mimeType = geminiVideoType(
    file!.mimeType ?? "application/octet-stream",
  );
  const part = { file_data: { mime_type: mimeType, file_uri: file!.uri } };
  if (!mimeType.startsWith("video/")) {
    return generate(
      () => ({
        systemInstruction: { parts: [{ text: instructions }] },
        contents: [{ role: "user", parts: [part, { text: request }] }],
      }),
      "read this file",
    );
  }
  return generate(
    (full) => ({
      systemInstruction: { parts: [{ text: instructions }] },
      contents: [
        {
          role: "user",
          parts: [
            full
              ? { ...part, video_metadata: { fps: FRAMES_PER_SECOND } }
              : part,
            { text: request },
          ],
        },
      ],
      generationConfig: { mediaResolution: "MEDIA_RESOLUTION_LOW" },
    }),
    "watch this video",
  );
}

// Puts a big file in Gemini's file store (kept 48 hours) and waits until it's ready.
async function uploadFile(bytes: Buffer, mimeType: string) {
  const key = process.env.GEMINI_API_KEY ?? "";
  const failed = () =>
    new GeminiError("The file couldn't be sent to the AI. Try again.", 502);
  const start = await fetch(
    "https://generativelanguage.googleapis.com/upload/v1beta/files",
    {
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
    },
  );
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!start.ok || !uploadUrl) throw failed();
  const done = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: new Uint8Array(bytes),
  });
  const uploaded = (await done.json().catch(() => null))?.file as
    | StoredFile
    | undefined;
  if (!done.ok || !uploaded) throw failed();
  let file: StoredFile = uploaded;
  for (let i = 0; i < 60 && file.state === "PROCESSING"; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${file.name}`,
      {
        headers: { "x-goog-api-key": key },
      },
    );
    const latest = (await res.json().catch(() => null)) as StoredFile | null;
    if (latest) file = latest;
  }
  if (file.state === "FAILED")
    throw new GeminiError(
      "The AI couldn't open this file. It may be damaged or protected.",
      422,
    );
  return file.uri;
}

// Asks about a PDF or text file, like a book saved in Dropbox.
export async function askAboutFile(
  file: { bytes: Buffer; mimeType: string },
  instructions: string,
  request: string,
) {
  const system = { parts: [{ text: instructions }] };
  let part: object;
  if (file.mimeType === "text/plain") {
    part = {
      text: `The file:\n\n${file.bytes.toString("utf8").slice(0, 2_000_000)}`,
    };
  } else if (file.bytes.length <= INLINE_MAX) {
    part = {
      inline_data: {
        mime_type: file.mimeType,
        data: file.bytes.toString("base64"),
      },
    };
  } else {
    part = {
      file_data: {
        mime_type: file.mimeType,
        file_uri: await uploadFile(file.bytes, file.mimeType),
      },
    };
  }
  return generate(
    () => ({
      systemInstruction: system,
      contents: [{ role: "user", parts: [part, { text: request }] }],
    }),
    "read this file",
  );
}

// One thing to ask about across a category: a YouTube video (watched from its link) or text.
export type SourcePart = { video: string } | { text: string };

// Videos in a whole-category question are watched more lightly than a single video: one frame
// every 10 seconds (with all the audio), so several fit into one free request.
const CATEGORY_FRAMES_PER_SECOND = 1 / 10;

// Asks one question across several videos, articles and notes at once (Ask this category).
export function askAboutSources(
  parts: SourcePart[],
  instructions: string,
  request: string,
) {
  const toParts = (full: boolean) =>
    parts.map((p) =>
      "video" in p
        ? {
            file_data: { file_uri: p.video },
            ...(full
              ? { video_metadata: { fps: CATEGORY_FRAMES_PER_SECOND } }
              : {}),
          }
        : { text: p.text },
    );
  const hasVideo = parts.some((p) => "video" in p);
  return generate(
    (full) => ({
      systemInstruction: { parts: [{ text: instructions }] },
      contents: [
        { role: "user", parts: [...toParts(full), { text: request }] },
      ],
      ...(hasVideo
        ? { generationConfig: { mediaResolution: "MEDIA_RESOLUTION_LOW" } }
        : {}),
    }),
    "answer from this category",
  );
}

// Search by meaning: turns text into a "meaning fingerprint" of 768 numbers, so texts about the
// same idea land close together even when they share no words. Free on Gemini's free tier.
// gemini-embedding-2 takes the job as a prefix on the text, not as a setting.
export const EMBEDDING_MODEL = "gemini-embedding-2";
export const EMBEDDING_SIZE = 768;

// Keeps the first 768 numbers and scales them back to length 1, in case a longer one comes back.
function fitEmbedding(values: unknown): number[] | null {
  if (!Array.isArray(values) || values.length < EMBEDDING_SIZE) return null;
  const v = values.slice(0, EMBEDDING_SIZE).map(Number);
  if (v.some((n) => !Number.isFinite(n))) return null;
  const length = Math.hypot(...v) || 1;
  return v.map((n) => n / length);
}

// `as` says what the text is: a search someone typed, or a saved item to be found.
export async function embedTexts(
  texts: { text: string; title?: string }[],
  as: "query" | "item",
): Promise<number[][]> {
  if (!texts.length) return [];
  const store = requestStore.getStore();
  const started = Date.now();
  const model = EMBEDDING_MODEL;
  const requests = texts.map(({ text, title }) => ({
    model: `models/${model}`,
    content: {
      parts: [
        {
          text:
            as === "query"
              ? `task: search result | query: ${text}`
              : `title: ${title?.trim() || "none"} | text: ${text}`,
        },
      ],
    },
    outputDimensionality: EMBEDDING_SIZE,
  }));
  let status = 502;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY ?? "",
        },
        body: JSON.stringify({ requests }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    status = res.status;
    const data = await res.json().catch(() => null);
    if (!res.ok)
      throw new GeminiError(
        `The AI couldn't read the meaning (${data?.error?.message ?? res.status}).`,
        res.status === 429 ? 429 : 502,
      );
    const out = (data?.embeddings ?? []).map((e: { values?: unknown }) =>
      fitEmbedding(e?.values),
    );
    if (out.length !== texts.length || out.some((e: number[] | null) => !e)) {
      status = 502;
      throw new GeminiError("The AI sent back an unexpected answer.", 502);
    }
    return out as number[][];
  } catch (error) {
    if (error instanceof GeminiError) throw error;
    status = 504;
    throw new GeminiError("The AI took too long to answer.", 504);
  } finally {
    // Google doesn't report tokens for embeddings; about 4 characters make a token.
    const chars = texts.reduce(
      (n, t) => n + t.text.length + (t.title?.length ?? 0),
      0,
    );
    store?.usage.push({
      ...usageRow(store.feature, model, status, started),
      input_tokens: Math.ceil(chars / 4),
    });
  }
}
