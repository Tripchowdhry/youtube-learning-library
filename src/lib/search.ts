// Search used by every tab: Videos, Reading, Tutorials, ScrapBook, Report Writer and Vault.
// - Every word you type must be found somewhere in the item, in any order and any field.
// - Capitals and accents don't matter ("cafe" finds "Café").
// - Simple plurals don't matter ("hook" finds "hooks", "story" finds "stories").
// - "Quoted words" must appear together, exactly in that order.
// It runs in the browser over lists that are already loaded, so it's instant and free.

import { splitTypedClips } from "@/lib/clips";

// One place an item can be found in, such as its title or its notes.
export type SearchField = { label: string; text: string | null | undefined };

// A prepared field: kept as typed (for the snippet), and in the two forms search compares against.
type Prepared = { label: string; text: string; folded: string; stemmed: string };
export type SearchIndex = Prepared[];

// A query word: as typed (folded), and with its plural taken off.
type Word = { raw: string; stem: string; phrase: boolean };

// Where an item matched, for the "Found in your notes: …" line. Null when the title alone matches.
export type SearchMatch = { label: string; snippet: string } | null;

const MARKS = /[̀-ͯ]/g;

// Lower case without accents, one character for one, so positions line up with the original text.
export function fold(text: string) {
  let out = "";
  for (const ch of text) {
    const plain = ch.normalize("NFD").replace(MARKS, "").toLowerCase();
    // Keep the length the same (a few characters, like "İ", fold into two).
    out += plain.length === ch.length ? plain : ch;
  }
  return out;
}

// Takes a simple English plural off a folded word: hooks → hook, stories → story, boxes → box.
export function stem(word: string) {
  if (word.length <= 3) return word;
  if (word.endsWith("ies") && word.length > 4) return word.slice(0, -3) + "y";
  if (/(ss|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !/(ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}

// Punctuation at the start or end of a word ("hooks," or "(react") isn't part of it.
const EDGE = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;
const PLAIN = /^[\p{L}\p{N}]+$/u;
const WORD_CHAR = /[\p{L}\p{N}]/u;

function stemText(folded: string) {
  return folded
    .split(/\s+/)
    .map((w) => stem(w.replace(EDGE, "")))
    .join(" ");
}

// The query as words. "Quoted words" stay together as one.
export function queryWords(query: string): Word[] {
  const words: Word[] = [];
  const folded = fold(query);
  const rest = folded.replace(/"([^"]*)"/g, (_, phrase: string) => {
    const raw = phrase.trim().replace(/\s+/g, " ");
    if (raw) words.push({ raw, stem: raw, phrase: true });
    return " ";
  });
  for (const part of rest.split(/[\s"]+/)) {
    if (!part) continue;
    // Only plain words get their plural taken off; "c++" or "node.js" are looked for as typed.
    words.push({ raw: part, stem: PLAIN.test(part) ? stem(part) : part, phrase: false });
  }
  return words;
}

// Typed notes and reports use a simple format (**bold**, # headings, - bullets, clips). Search
// looks at the words only.
export function notesText(saved: string | null | undefined) {
  if (!saved) return "";
  return splitTypedClips(saved)
    .text.replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\*\*/g, "")
    .replace(/^[ \t]*(#{1,6}|[-*]|\d+\.)[ \t]+/gm, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    // Lines are joined with a dot, so a snippet still reads as separate points.
    .join(" · ");
}

// Prepares an item's fields once, so typing in the search box stays quick on long lists.
export function prepare(fields: SearchField[]): SearchIndex {
  return fields
    .filter((f) => f.text && f.text.trim())
    .map((f) => {
      const text = f.text!.replace(/\s+/g, " ").trim();
      const folded = fold(text);
      return { label: f.label, text, folded, stemmed: stemText(folded) };
    });
}

function inField(field: Prepared, word: Word) {
  if (field.folded.includes(word.raw)) return true;
  return !word.phrase && field.stemmed.includes(word.stem);
}

// True when every word is found somewhere in the item.
export function matches(index: SearchIndex, words: Word[]) {
  return words.every((w) => index.some((f) => inField(f, w)));
}

// Where in the folded text a word shows, for highlighting and snippets. Words are found by the
// start they share with their plural, so "story" also lights up "stories".
function root(word: Word) {
  if (word.phrase || !PLAIN.test(word.raw)) return word.raw;
  return word.stem.endsWith("y") && word.stem.length > 3 ? word.stem.slice(0, -1) : word.stem;
}

// The parts of `text` to highlight, as [start, end) pairs in order, without overlaps.
export function highlightRanges(text: string, words: Word[]) {
  const folded = fold(text);
  const ranges: [number, number][] = [];
  for (const word of words) {
    for (const needle of new Set([word.raw, root(word)])) {
      if (!needle) continue;
      for (let at = folded.indexOf(needle); at !== -1; at = folded.indexOf(needle, at + needle.length)) {
        // Light up the rest of the word too, so "story" marks all of "stories".
        let end = at + needle.length;
        while (end < folded.length && WORD_CHAR.test(folded[end])) end++;
        ranges.push([at, end]);
      }
    }
  }
  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}

const SNIPPET = 140;

// A short piece of the text around the first word found in it.
function snippet(field: Prepared, words: Word[]) {
  const { text } = field;
  if (text.length <= SNIPPET) return text;
  const first = highlightRanges(text, words)[0]?.[0] ?? 0;
  let start = Math.max(0, first - 30);
  // Start at a word, not halfway through one.
  if (start > 0) {
    const space = text.indexOf(" ", start);
    if (space !== -1 && space < first) start = space + 1;
  }
  let end = Math.min(text.length, start + SNIPPET);
  if (end < text.length) {
    const space = text.lastIndexOf(" ", end);
    if (space > first) end = space;
  }
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

// Says where a match came from when the title alone doesn't explain it: the first field that
// holds a word the title is missing.
export function whereFound(index: SearchIndex, words: Word[], titleLabel = "Title"): SearchMatch {
  const title = index.find((f) => f.label === titleLabel);
  const missing = words.filter((w) => !title || !inField(title, w));
  if (!missing.length) return null;
  const field = index.find((f) => f !== title && missing.some((w) => inField(f, w)));
  return field ? { label: field.label, snippet: snippet(field, words) } : null;
}

export type { Word as SearchWord };

// How well an item matches, for putting the best matches first. Each word counts for the best
// field it's found in: the title most, then the fields in the order they were given.
export function rank(index: SearchIndex, words: Word[]) {
  let score = 0;
  for (const word of words) {
    const at = index.findIndex((f) => inField(f, word));
    if (at !== -1) score += Math.max(1, 4 - at);
  }
  // A title that holds every word, or starts with the first one, beats one that holds some.
  const title = index.find((f) => f.label === "Title");
  if (title && words.length && words.every((w) => inField(title, w))) score += 2;
  if (title && words[0] && title.folded.startsWith(words[0].raw)) score += 1;
  return score;
}

// "1 result" or "3 results".
export const resultCount = (n: number) => `${n} result${n === 1 ? "" : "s"}`;

// Sorts best match first when there are search words; ties (and a tag on its own) keep `then`.
export function bestFirst<T>(words: Word[], indexOf: (item: T) => SearchIndex, then: (a: T, b: T) => number) {
  if (!words.length) return then;
  const scores = new Map<T, number>();
  const score = (item: T) => {
    if (!scores.has(item)) scores.set(item, rank(indexOf(item), words));
    return scores.get(item)!;
  };
  return (a: T, b: T) => score(b) - score(a) || then(a, b);
}
