// Which Gemini models to ask, in order. Google retires models every few months, so instead of
// trusting a fixed list the app asks Google once a day which models this key can use, and keeps
// that answer:
//   1. in this server's memory for an hour (no wait at all), then
//   2. in Vercel's shared cache for a day (a quick read), then
//   3. from Google itself, at most about once a day.
// If a model turns out to be retired during the day, it's skipped and a fresh list is fetched.
// If Google's list can't be read, the fixed list below is used, as before.
import { revalidateTag } from "next/cache";

// The safe fallback, and the order we prefer when these are still offered.
export const FALLBACK_MODELS = [
  // Gemini 4 Hydrogen first: Google's newest everyday model (November 2026), smarter than
  // 3.8 Flash and free on the free plan. When its daily free uses run out, or it turns a
  // request down, Google answers 429/400 and the next model is used.
  "gemini-4-hydrogen",
  // The newest Flash next. Its free plan allows only about 20 uses a day.
  "gemini-3.8-flash",
  "gemini-flash-latest",
  // The light models last. Gemini 2.5 Flash Lite is closed to new keys and Google points to
  // 3.5 Flash Lite instead; 2.5 Flash and 3.6 Flash are being retired too, so none are asked for.
  "gemini-3.5-flash-lite",
  "gemini-flash-lite-latest",
];

const TAG = "gemini-models";
const HOUR = 60 * 60 * 1000;
const DAY_SECONDS = 24 * 60 * 60;
// At most this many models Google offers that aren't in the list above are added after it,
// so a request never works its way through a long chain of failures.
const MAX_EXTRA = 3;

let memory: { at: number; models: string[]; fromGoogle: boolean } | null = null;
// Models that failed as retired on this server, and when. They're skipped for a day.
const retired = new Map<string, number>();
let lastRefresh = 0;

// Asks Google which models this key can use. The answer is kept in Vercel's cache for a day,
// shared by every request; null if Google couldn't be asked.
async function availableModels(): Promise<Set<string> | null> {
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000", {
      headers: { "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
      next: { revalidate: DAY_SECONDS, tags: [TAG] },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      console.error("Couldn't read Gemini's model list", res.status);
      return null;
    }
    const data = (await res.json().catch(() => null)) as { models?: { name?: string; supportedGenerationMethods?: string[] }[] } | null;
    const ids = (data?.models ?? [])
      .filter((m) => m.name && (m.supportedGenerationMethods ?? []).includes("generateContent"))
      .map((m) => m.name!.replace(/^models\//, ""));
    return ids.length ? new Set(ids) : null;
  } catch (e) {
    console.error("Couldn't read Gemini's model list", e);
    return null;
  }
}

// A general text-and-video model, not a preview, a dated snapshot, or a special one
// (pictures, speech, live audio, embeddings and so on).
function everydayModel(id: string) {
  return (
    /^gemini-/.test(id) &&
    !/preview|exp|image|tts|embedding|live|audio|native|robotics|computer-use|aqa|vision|thinking|learnlm|latest/.test(id) &&
    !/-\d{3}$/.test(id)
  );
}

function version(id: string) {
  return Number(id.match(/^gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0);
}

// Flash is the free everyday model; Pro has very few free uses, so it's tried last.
function tier(id: string) {
  if (/flash-lite/.test(id)) return 2;
  if (/flash/.test(id)) return 0;
  if (/pro/.test(id)) return 3;
  return 1;
}

const unique = (list: string[]) => list.filter((m, i) => list.indexOf(m) === i);

// The order to try models in, given the ones Google offers (null: unknown, use the fixed list).
export function orderModels(available: Set<string> | null) {
  const chosen = process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : [];
  if (!available) return unique([...chosen, ...FALLBACK_MODELS]);
  // The "-latest" names always point at a current model, so they're kept even if unlisted.
  const known = FALLBACK_MODELS.filter((m) => available.has(m) || m.endsWith("-latest"));
  const extra = [...available]
    .filter((m) => everydayModel(m) && !FALLBACK_MODELS.includes(m))
    .sort((a, b) => version(b) - version(a) || tier(a) - tier(b))
    .slice(0, MAX_EXTRA);
  const list = unique([...chosen, ...known, ...extra]);
  return list.length ? list : unique([...chosen, ...FALLBACK_MODELS]);
}

// The models to try for this request, with no wait in the usual case.
export async function geminiModels() {
  const now = Date.now();
  // A list from Google is kept for an hour here; a fallback only for five minutes, so a
  // short outage at Google doesn't stick.
  if (!memory || now - memory.at > (memory.fromGoogle ? HOUR : HOUR / 12)) {
    const available = await availableModels();
    memory = { at: now, models: orderModels(available), fromGoogle: Boolean(available) };
    const missing = FALLBACK_MODELS.filter((m) => available && !available.has(m) && !m.endsWith("-latest"));
    if (missing.length) console.warn("Gemini no longer offers", missing.join(", "));
  }
  for (const [model, at] of retired) if (now - at > DAY_SECONDS * 1000) retired.delete(model);
  const usable = memory.models.filter((m) => !retired.has(m));
  return usable.length ? usable : memory.models;
}

// Did this failure mean the model is gone (retired, renamed, or never offered)?
export function looksRetired(status: number, detail: string) {
  if (status === 404) return true;
  return status === 400 && /no longer (available|supported)|deprecated|retired|not found|is not supported for generatecontent/i.test(detail);
}

// A model failed as retired: skip it here for the day, and get a fresh list from Google
// (at most once an hour, so a model Google still lists by mistake can't cause a flood).
export function modelRetired(model: string) {
  const now = Date.now();
  retired.set(model, now);
  console.warn("Gemini model looks retired, skipping it today:", model);
  if (now - lastRefresh < HOUR) return;
  lastRefresh = now;
  memory = null;
  try {
    revalidateTag(TAG);
  } catch {
    // Outside a request (in tests) there's no shared cache to clear.
  }
}

// For tests: start with nothing remembered.
export function forgetModelList() {
  memory = null;
  retired.clear();
  lastRefresh = 0;
}
