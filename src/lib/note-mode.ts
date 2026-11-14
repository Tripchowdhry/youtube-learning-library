// Which side a notes page opens on: Typing or Handwriting. Used by video notes and ScrapBook
// pages, so both behave the same way.

import type { NotePage } from "@/lib/types";

export type NoteMode = "write" | "type";

// True when any handwriting page has something on it: ink, a time stamp or a picture.
export function hasWriting(pages: NotePage[] | null | undefined) {
  return (pages ?? []).some((p) => p.strokes?.length || p.stamps?.length || p.images?.length);
}

// The mode last picked on this device; otherwise typing with a mouse or trackpad, handwriting on an iPad.
export function preferredMode(storageKey: string): NoteMode {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored === "write" || stored === "type") return stored;
  } catch {
    // Fall through to the device default.
  }
  return window.matchMedia("(any-pointer: fine)").matches ? "type" : "write";
}

// Opens the side that holds the notes, so notes kept only on one side are never hidden behind
// an empty page. With notes on both sides, or none yet, the last picked mode is used.
export function openingMode(storageKey: string, hasTyped: boolean, hasWritten: boolean): NoteMode {
  if (hasTyped && !hasWritten) return "type";
  if (hasWritten && !hasTyped) return "write";
  return preferredMode(storageKey);
}
