// Typed notes in Videos, Reading and Tutorials use the same simple format as reports
// (src/lib/report.ts), so the same editor, Copy and Download Word work on them.

import type { TypedClip } from "@/lib/clips";
import { formatTime } from "@/lib/youtube-player";

// The line an AI answer starts with: the question, shown in bold.
export const answerHeading = (prompt: string, model?: string | null) =>
  `**✨ ${prompt.replace(/\*\*/g, "")}${model ? ` (${model})` : ""}**`;

// Older notes have the AI question as a plain "✨ …" line; show it in bold like new ones.
export const boldPrompts = (text: string) =>
  text.replace(/^[ \t]*(✨[^\n]*?)[ \t]*$/gm, (_, line: string) => `**${line.replace(/\*\*/g, "")}**`);

// The notes as one document for Copy and Download Word: title, link, text, then the clips.
export function notesDocument(title: string, url: string | null, text: string, clips: TypedClip[]) {
  const parts = [`# ${title}`];
  if (url) parts.push(url);
  if (text.trim()) parts.push(text.trim());
  if (clips.length) parts.push(clips.map((c) => `${c.t === null ? "" : `[${formatTime(c.t)}] `}![clip](${c.path})`).join("\n"));
  return parts.join("\n\n");
}

// Marks each AI question line ("✨ …") in a notes box so it shows with a coloured background.
// The mark is only for showing: it's put back after every change and never saved.
export function markAiQuestions(box: HTMLElement | null) {
  if (!box) return;
  for (const el of Array.from(box.children)) {
    const isQuestion = (el.textContent ?? "").trimStart().startsWith("✨");
    if (isQuestion) el.setAttribute("data-ai-q", "");
    else el.removeAttribute("data-ai-q");
  }
}
