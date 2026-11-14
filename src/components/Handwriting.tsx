"use client";

// Handwriting sheets with pen, highlighter and eraser, shared by ScrapBook pages and
// Reading and Tutorials notes. Works with Apple Pencil, and with a finger when that's switched on.

import { useRef, useState } from "react";
import NotePageCanvas, { PAGE_HEIGHT, type Tool } from "@/components/NotePageCanvas";
import type { ClipImage } from "@/lib/clips";
import type { NoteImage, NotePage, NoteStroke } from "@/lib/types";

export const PEN_COLORS = ["#111827", "#2563eb", "#dc2626", "#16a34a"];
export const HIGHLIGHT_COLORS = ["#facc15", "#4ade80", "#f472b6", "#60a5fa"];
export const SIZES = [
  { label: "Fine", value: 2 },
  { label: "Medium", value: 4 },
  { label: "Bold", value: 7 },
];
export const emptyPage = (): NotePage => ({ strokes: [], stamps: [] });

// Puts a picture under the last one on the last sheet, or on a new sheet when there's no room.
export function withPicture(pages: NotePage[], image: ClipImage, path: string): NotePage[] {
  const current = pages.length ? pages : [emptyPage()];
  const w = 640;
  const h = Math.round((w * image.height) / image.width);
  let page = current.length - 1;
  let y = Math.max(60, ...(current[page].images ?? []).map((im) => im.y + im.h + 30));
  let next = current;
  if (y + h > PAGE_HEIGHT - 20) {
    page += 1;
    y = 60;
    next = [...current, emptyPage()];
  }
  const im: NoteImage = { id: crypto.randomUUID(), path, x: 100, y, w, h, t: 0 };
  return next.map((p, i) => (i === page ? { ...p, images: [...(p.images ?? []), im] } : p));
}

// The sheets with their own toolbar, for places that don't need anything more.
export function HandwritingPad(props: {
  pages: NotePage[];
  onChange: (pages: NotePage[]) => void;
  imageUrl: (path: string) => string;
  // Keeps the toolbar in view while scrolling, under any header (a Tailwind top-* class).
  stickyTop?: string;
}) {
  const pages = props.pages.length ? props.pages : [emptyPage()];
  const [tool, setTool] = useState<Tool>("pen");
  const [penColor, setPenColor] = useState(PEN_COLORS[0]);
  const [highlightColor, setHighlightColor] = useState(HIGHLIGHT_COLORS[0]);
  const [size, setSize] = useState(SIZES[0].value);
  const [fingerDraws, setFingerDraws] = useState(false);
  const history = useRef<NotePage[][]>([]);
  const [canUndo, setCanUndo] = useState(false);

  function change(next: NotePage[]) {
    history.current.push(pages);
    if (history.current.length > 100) history.current.shift();
    setCanUndo(true);
    props.onChange(next);
  }

  function undo() {
    const previous = history.current.pop();
    if (!previous) return;
    setCanUndo(history.current.length > 0);
    props.onChange(previous);
  }

  function addStroke(pageIndex: number, stroke: NoteStroke) {
    change(pages.map((p, i) => (i === pageIndex ? { ...p, strokes: [...p.strokes, stroke] } : p)));
  }

  function eraseStrokes(pageIndex: number, indexes: number[]) {
    const gone = new Set(indexes);
    change(pages.map((p, i) => (i === pageIndex ? { ...p, strokes: p.strokes.filter((_, j) => !gone.has(j)) } : p)));
  }

  function clearPage(pageIndex: number) {
    if (!window.confirm(`Erase everything on sheet ${pageIndex + 1}?`)) return;
    change(
      pages.length > 1 && pageIndex === pages.length - 1
        ? pages.slice(0, -1)
        : pages.map((p, i) => (i === pageIndex ? emptyPage() : p)),
    );
  }

  function deleteImage(pageIndex: number, imageId: string) {
    if (!window.confirm("Delete this picture from the sheet?")) return;
    change(pages.map((p, i) => (i === pageIndex ? { ...p, images: (p.images ?? []).filter((im) => im.id !== imageId) } : p)));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className={`sticky z-10 flex flex-wrap items-center gap-2 rounded-xl bg-white p-2 shadow-sm ring-1 ring-slate-200 ${props.stickyTop ?? "top-0"}`}>
        <InkTools
          tool={tool}
          setTool={setTool}
          color={tool === "highlighter" ? highlightColor : penColor}
          setColor={tool === "highlighter" ? setHighlightColor : setPenColor}
          colors={tool === "highlighter" ? HIGHLIGHT_COLORS : PEN_COLORS}
          size={size}
          setSize={setSize}
          canUndo={canUndo}
          onUndo={undo}
          fingerDraws={fingerDraws}
          setFingerDraws={setFingerDraws}
        />
      </div>
      {pages.map((page, i) => (
        <div key={i} className="flex flex-col gap-1">
          <div className="flex items-center justify-between px-1 text-xs text-slate-500">
            <span>Sheet {i + 1}</span>
            <button onClick={() => clearPage(i)} className="rounded px-1.5 py-0.5 hover:bg-slate-200">
              {pages.length > 1 && i === pages.length - 1 ? "Delete sheet" : "Clear sheet"}
            </button>
          </div>
          <NotePageCanvas
            page={page}
            tool={tool}
            color={tool === "highlighter" ? highlightColor : penColor}
            size={size}
            fingerDraws={fingerDraws}
            onAddStroke={(stroke) => addStroke(i, stroke)}
            onEraseStrokes={(indexes) => eraseStrokes(i, indexes)}
            onStampTap={() => {}}
            imageUrl={props.imageUrl}
            onDeleteImage={(id) => deleteImage(i, id)}
          />
        </div>
      ))}
      <button
        onClick={() => change([...pages, emptyPage()])}
        className="rounded-lg border-2 border-dashed border-slate-300 py-4 text-sm font-medium text-slate-600 hover:bg-white"
      >
        + Add sheet
      </button>
    </div>
  );
}

export function InkTools(props: {
  tool: Tool;
  setTool: (t: Tool) => void;
  color: string;
  setColor: (c: string) => void;
  colors: string[];
  size: number;
  setSize: (s: number) => void;
  canUndo: boolean;
  onUndo: () => void;
  fingerDraws: boolean;
  setFingerDraws: (v: boolean) => void;
}) {
  const tools: { id: Tool; label: string }[] = [
    { id: "pen", label: "Pen" },
    { id: "highlighter", label: "Highlighter" },
    { id: "eraser", label: "Eraser" },
  ];
  return (
    <>
      <div className="flex overflow-hidden rounded-lg ring-1 ring-slate-300">
        {tools.map((t) => (
          <button
            key={t.id}
            onClick={() => props.setTool(t.id)}
            className={`px-3 py-1.5 text-sm ${props.tool === t.id ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {props.tool !== "eraser" && (
        <>
          <div className="flex items-center gap-1.5">
            {props.colors.map((c) => (
              <button
                key={c}
                onClick={() => props.setColor(c)}
                aria-label={`Color ${c}`}
                className={`h-7 w-7 rounded-full ring-offset-2 ${props.color === c ? "ring-2 ring-slate-900" : ""}`}
                style={{ background: c }}
              />
            ))}
          </div>
          <div className="flex overflow-hidden rounded-lg ring-1 ring-slate-300">
            {SIZES.map((s) => (
              <button
                key={s.value}
                onClick={() => props.setSize(s.value)}
                className={`px-2.5 py-1.5 text-xs ${props.size === s.value ? "bg-slate-200 font-semibold" : "hover:bg-slate-100"}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </>
      )}
      <button
        onClick={props.onUndo}
        disabled={!props.canUndo}
        className="rounded-lg px-3 py-1.5 text-sm ring-1 ring-slate-300 hover:bg-slate-100 disabled:opacity-40"
      >
        Undo
      </button>
      <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-600">
        <input type="checkbox" checked={props.fingerDraws} onChange={(e) => props.setFingerDraws(e.target.checked)} />
        Draw with finger
      </label>
    </>
  );
}

