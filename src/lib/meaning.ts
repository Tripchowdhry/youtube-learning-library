// Search by meaning, the parts the browser and the server share. Each saved item gets a "meaning
// fingerprint" (see embedTexts in gemini.ts), kept in item_meanings with a short hash of the text
// it was made from, so an item only gets a new one when its text changes.

// The tabs, as named in item_meanings.kind (the same names as search's sections).
export const MEANING_KINDS = ["videos", "reading", "tutorial", "scrapbook", "reports"];

// How much of an item's text goes into its fingerprint, and how many items go to Google at once.
export const MEANING_TEXT_MAX = 3_000;
export const MEANING_BATCH = 25;

// Changing this makes every item get a new fingerprint (e.g. after changing the model).
const VERSION = "gemini-embedding-2/768/1";

// A short hash of an item's text (FNV-1a), to tell when it has changed.
export function meaningHash(title: string, text: string) {
  let h = 0x811c9dc5;
  const s = `${VERSION}\n${title}\n${text}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + s.length.toString(36);
}

// The text a fingerprint is made from: the parts that say what an item is about, tidied and cut short.
export function meaningText(parts: string[]) {
  return parts
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, MEANING_TEXT_MAX);
}
