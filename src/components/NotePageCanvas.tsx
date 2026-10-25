"use client";

import { useCallback, useEffect, useRef } from "react";
import { formatTime } from "@/lib/youtube-player";
import type { NotePage, NotePoint, NoteStroke } from "@/lib/types";

export const PAGE_WIDTH = 1000;
export const PAGE_HEIGHT = 1300;
const LINE_GAP = 50;
const MARGIN_X = 80;
const ERASER_RADIUS = 18;

export type Tool = "pen" | "highlighter" | "eraser";

type Props = {
  page: NotePage;
  tool: Tool;
  color: string;
  size: number;
  fingerDraws: boolean;
  onAddStroke: (stroke: NoteStroke) => void;
  onEraseStrokes: (indexes: number[]) => void;
  onStampTap: (stampId: string, seconds: number) => void;
};

function drawStroke(ctx: CanvasRenderingContext2D, stroke: NoteStroke) {
  const pts = stroke.points;
  if (!pts.length) return;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = stroke.color;

  if (stroke.tool === "highlighter") {
    // One path so overlapping parts of the same stroke don't get darker.
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = stroke.size * 5;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
    if (pts.length === 1) ctx.lineTo(pts[0][0] + 0.1, pts[0][1]);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }

  // Pen: line width follows Apple Pencil pressure.
  if (pts.length === 1) {
    ctx.fillStyle = stroke.color;
    ctx.beginPath();
    ctx.arc(pts[0][0], pts[0][1], (stroke.size * (0.5 + pts[0][2])) / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0, p0] = pts[i - 1];
    const [x1, y1, p1] = pts[i];
    ctx.lineWidth = stroke.size * (0.5 + (p0 + p1) / 2);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
}

function drawPaper(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  ctx.strokeStyle = "#dbe4ef";
  ctx.lineWidth = 1.5;
  for (let y = LINE_GAP * 2; y < PAGE_HEIGHT; y += LINE_GAP) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(PAGE_WIDTH, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "#f3b4b4";
  ctx.beginPath();
  ctx.moveTo(MARGIN_X, 0);
  ctx.lineTo(MARGIN_X, PAGE_HEIGHT);
  ctx.stroke();
}

function nearStroke(stroke: NoteStroke, x: number, y: number) {
  const reach = ERASER_RADIUS + (stroke.tool === "highlighter" ? stroke.size * 2.5 : stroke.size);
  return stroke.points.some(([px, py]) => (px - x) ** 2 + (py - y) ** 2 <= reach * reach);
}

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

export default function NotePageCanvas(props: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const current = useRef<{ pointerId: number; stroke: NoteStroke | null; erased: Set<number> } | null>(null);
  const latest = useRef(props);
  latest.current = props;

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const scale = canvas.width / PAGE_WIDTH;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    drawPaper(ctx);
    const erased = current.current?.erased;
    latest.current.page.strokes.forEach((stroke, i) => {
      if (!erased?.has(i)) drawStroke(ctx, stroke);
    });
    if (current.current?.stroke) drawStroke(ctx, current.current.stroke);
  }, []);

  // Match the canvas resolution to its on-screen size (sharp on Retina screens).
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      const width = wrap.clientWidth;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(((width * PAGE_HEIGHT) / PAGE_WIDTH) * ratio);
      redraw();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [redraw]);

  useEffect(() => {
    redraw();
  }, [props.page, redraw]);

  // On iPad, stop the Pencil from scrolling the page while still letting fingers scroll.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const block = (e: TouchEvent) => {
      const stylus = Array.from(e.changedTouches).some(
        (t) => (t as Touch & { touchType?: string }).touchType === "stylus",
      );
      if (stylus || latest.current.fingerDraws) e.preventDefault();
    };
    canvas.addEventListener("touchstart", block, { passive: false });
    canvas.addEventListener("touchmove", block, { passive: false });
    return () => {
      canvas.removeEventListener("touchstart", block);
      canvas.removeEventListener("touchmove", block);
    };
  }, []);

  function toPoint(e: PointerEvent | React.PointerEvent): NotePoint {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * PAGE_WIDTH;
    const y = ((e.clientY - rect.top) / rect.height) * PAGE_HEIGHT;
    const pressure = e.pointerType === "pen" && e.pressure > 0 ? e.pressure : 0.5;
    return [round(x, 1), round(y, 1), round(pressure, 2)];
  }

  function eraseAt([x, y]: NotePoint) {
    const state = current.current;
    if (!state) return;
    let changed = false;
    props.page.strokes.forEach((stroke, i) => {
      if (!state.erased.has(i) && nearStroke(stroke, x, y)) {
        state.erased.add(i);
        changed = true;
      }
    });
    if (changed) redraw();
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.pointerType === "touch" && !props.fingerDraws) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (current.current) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const point = toPoint(e);
    if (props.tool === "eraser") {
      current.current = { pointerId: e.pointerId, stroke: null, erased: new Set() };
      eraseAt(point);
    } else {
      current.current = {
        pointerId: e.pointerId,
        stroke: { tool: props.tool, color: props.color, size: props.size, points: [point] },
        erased: new Set(),
      };
      redraw();
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const state = current.current;
    if (!state || state.pointerId !== e.pointerId) return;
    // Coalesced events give the full detail of fast Pencil strokes.
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    const points = (events.length ? events : [e.nativeEvent]).map(toPoint);
    if (!state.stroke) {
      points.forEach(eraseAt);
      return;
    }
    const stroke = state.stroke;
    const ctx = canvasRef.current?.getContext("2d");
    if (stroke.tool === "pen" && ctx) {
      // Draw just the new pieces for speed.
      const tail = stroke.points[stroke.points.length - 1];
      stroke.points.push(...points);
      drawStroke(ctx, { ...stroke, points: [tail, ...points] });
    } else {
      stroke.points.push(...points);
      redraw();
    }
  }

  function finish(e: React.PointerEvent<HTMLCanvasElement>) {
    const state = current.current;
    if (!state || state.pointerId !== e.pointerId) return;
    current.current = null;
    if (state.stroke) {
      props.onAddStroke(state.stroke);
    } else if (state.erased.size) {
      props.onEraseStrokes(Array.from(state.erased));
    } else {
      redraw();
    }
  }

  return (
    <div ref={wrapRef} className="relative w-full overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
      <canvas
        ref={canvasRef}
        className="block w-full select-none"
        style={{
          aspectRatio: `${PAGE_WIDTH} / ${PAGE_HEIGHT}`,
          touchAction: props.fingerDraws ? "none" : "pan-y pinch-zoom",
          WebkitTouchCallout: "none",
          WebkitUserSelect: "none",
          cursor: props.tool === "eraser" ? "cell" : "crosshair",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
      />
      {props.page.stamps.map((stamp) => (
        <button
          key={stamp.id}
          onClick={() => props.onStampTap(stamp.id, stamp.t)}
          className={`absolute -translate-y-1/2 rounded-full px-2 py-0.5 font-mono text-xs font-semibold shadow-sm ${
            props.tool === "eraser"
              ? "bg-red-100 text-red-700 ring-1 ring-red-300"
              : "bg-red-600 text-white hover:bg-red-700"
          }`}
          style={{ left: `${(stamp.x / PAGE_WIDTH) * 100}%`, top: `${(stamp.y / PAGE_HEIGHT) * 100}%` }}
          title={props.tool === "eraser" ? "Remove this time stamp" : "Jump the video to this moment"}
        >
          {props.tool === "eraser" ? "✕ " : "▶ "}
          {formatTime(stamp.t)}
        </button>
      ))}
    </div>
  );
}
