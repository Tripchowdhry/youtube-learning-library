"use client";

// Drag and drop done with mouse events instead of the browser's built-in drag and drop.
// Safari on Mac refused drops from the built-in version, so every row and card that can be
// dragged, and every place that takes a drop, uses this instead. It behaves the same in every browser.

import { useEffect, useRef, useState, type RefObject } from "react";

type Target = { canDrop: () => boolean; drop: () => void; setOver: (over: boolean) => void };

const targets = new Map<Element, Target>();

// Pixels the mouse has to move with the button held before it counts as a drag, so clicks stay clicks.
const THRESHOLD = 5;
// How close to the edge of a scrolling list (or the window) the pointer has to be to scroll it.
const EDGE = 40;

function findTarget(x: number, y: number): Target | null {
  let el = document.elementFromPoint(x, y);
  while (el) {
    const t = targets.get(el);
    if (t && t.canDrop()) return t;
    el = el.parentElement;
  }
  return null;
}

function scrollableParent(el: Element | null): Element | null {
  while (el && el !== document.body) {
    const style = getComputedStyle(el);
    if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight) return el;
    el = el.parentElement;
  }
  return null;
}

function setPageDragging(on: boolean) {
  const s = document.body.style;
  s.userSelect = on ? "none" : "";
  s.setProperty("-webkit-user-select", on ? "none" : "");
  s.cursor = on ? "grabbing" : "";
}

function startDrag(e: React.PointerEvent<HTMLElement>, onStart: () => void, onEnd: () => void) {
  if (e.pointerType !== "mouse" || e.button !== 0) return;
  // Typing and choosing in a field never starts a drag.
  if ((e.target as Element).closest("input, textarea, select, [contenteditable=true]")) return;

  const source = e.currentTarget;
  const startX = e.clientX;
  const startY = e.clientY;
  let started = false;
  let ghost: HTMLElement | null = null;
  let current: Target | null = null;
  let lastX = startX;
  let lastY = startY;
  let scrollTimer: number | undefined;

  const autoScroll = () => {
    const box = scrollableParent(document.elementFromPoint(lastX, lastY));
    if (box) {
      const r = box.getBoundingClientRect();
      if (lastY < r.top + EDGE) box.scrollTop -= 12;
      else if (lastY > r.bottom - EDGE) box.scrollTop += 12;
    }
    if (lastY < EDGE) window.scrollBy(0, -12);
    else if (lastY > window.innerHeight - EDGE) window.scrollBy(0, 12);
  };

  const begin = () => {
    started = true;
    // A small copy of the row follows the pointer, beside it, so the place you drop on stays visible.
    const rect = source.getBoundingClientRect();
    ghost = source.cloneNode(true) as HTMLElement;
    ghost.removeAttribute("id");
    Object.assign(ghost.style, {
      position: "fixed",
      left: `${startX + 14}px`,
      top: `${startY + 10}px`,
      width: `${Math.min(rect.width, 300)}px`,
      maxHeight: "84px",
      overflow: "hidden",
      margin: "0",
      opacity: "0.9",
      pointerEvents: "none",
      zIndex: "9999",
      borderRadius: "10px",
      boxShadow: "0 10px 25px rgba(15, 23, 42, 0.25)",
    });
    document.body.appendChild(ghost);
    window.getSelection()?.removeAllRanges();
    setPageDragging(true);
    scrollTimer = window.setInterval(autoScroll, 30);
    onStart();
  };

  const move = (ev: PointerEvent) => {
    lastX = ev.clientX;
    lastY = ev.clientY;
    if (!started) {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < THRESHOLD) return;
      begin();
    }
    ev.preventDefault();
    if (ghost) {
      ghost.style.left = `${ev.clientX + 14}px`;
      ghost.style.top = `${ev.clientY + 10}px`;
    }
    const next = findTarget(ev.clientX, ev.clientY);
    if (next !== current) {
      current?.setOver(false);
      next?.setOver(true);
      current = next;
    }
  };

  const finish = (drop: boolean) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    window.removeEventListener("keydown", key);
    if (!started) return;
    window.clearInterval(scrollTimer);
    ghost?.remove();
    setPageDragging(false);
    current?.setOver(false);
    if (drop && current && current.canDrop()) current.drop();
    onEnd();
    // The mouse-up after a drag would also count as a click on whatever is under it; swallow that one click.
    const swallow = (ev: MouseEvent) => {
      ev.stopPropagation();
      ev.preventDefault();
    };
    window.addEventListener("click", swallow, { capture: true, once: true });
    window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
  };
  const up = () => finish(true);
  const cancel = () => finish(false);
  const key = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") finish(false);
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
  window.addEventListener("keydown", key);
}

/**
 * Makes an element draggable and/or a place to drop. Spread `handlers` onto the element and give it `ref`.
 * `onDragStart` turns dragging on; `onDrop` (with `canDrop`) turns it into a drop target. `over` is true
 * while something droppable is held over it.
 */
export function usePointerDrag<T extends HTMLElement>(
  opts: {
    onDragStart?: () => void;
    onDragEnd?: () => void;
    canDrop?: boolean;
    onDrop?: () => void;
  },
  existingRef?: RefObject<T | null>,
) {
  const ownRef = useRef<T>(null);
  const ref = existingRef ?? ownRef;
  const [over, setOver] = useState(false);
  const latest = useRef(opts);
  useEffect(() => {
    latest.current = opts;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    targets.set(el, {
      canDrop: () => Boolean(latest.current.canDrop && latest.current.onDrop),
      drop: () => latest.current.onDrop?.(),
      setOver,
    });
    return () => {
      targets.delete(el);
    };
  }, [ref]);

  const draggable = Boolean(opts.onDragStart);
  const handlers = {
    onPointerDown: draggable
      ? (e: React.PointerEvent<T>) =>
          startDrag(
            e as React.PointerEvent<HTMLElement>,
            () => latest.current.onDragStart?.(),
            () => latest.current.onDragEnd?.(),
          )
      : undefined,
    // Keep the browser's own drag (of the row, a link or an image inside it) out of the way.
    onDragStart: (e: React.DragEvent) => e.preventDefault(),
  };
  return { ref, over: over && Boolean(opts.canDrop), handlers };
}
