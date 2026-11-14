// Turns one handwritten notes page into a PNG picture, so the AI can read the writing.
// Only the pen and highlighter strokes are drawn, on plain white (no ruled lines),
// cropped to where the writing is. Runs in the browser; nothing is saved.

import { PAGE_HEIGHT, PAGE_WIDTH, drawStroke } from "@/components/NotePageCanvas";
import type { NotePage } from "@/lib/types";

const MAX_WIDTH = 1400;
const PADDING = 30;

// The picture as base64 PNG (without the "data:" prefix), or null if the page has no writing.
export function pageToPng(page: NotePage): string | null {
  const strokes = (page.strokes ?? []).filter((s) => s.points?.length);
  if (!strokes.length) return null;

  // The area the writing covers, so the picture isn't mostly empty paper.
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const s of strokes) {
    for (const [x, y] of s.points) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  minX = Math.max(0, minX - PADDING);
  minY = Math.max(0, minY - PADDING);
  maxX = Math.min(PAGE_WIDTH, maxX + PADDING);
  maxY = Math.min(PAGE_HEIGHT, maxY + PADDING);
  const w = Math.max(50, maxX - minX);
  const h = Math.max(50, maxY - minY);
  // Small writing is drawn bigger, up to MAX_WIDTH wide.
  const scale = Math.min(2, MAX_WIDTH / w);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, -minX * scale, -minY * scale);
  for (const s of strokes) drawStroke(ctx, s);
  return canvas.toDataURL("image/png").split(",")[1] ?? null;
}
