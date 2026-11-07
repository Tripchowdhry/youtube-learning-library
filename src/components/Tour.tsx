"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { onboarding } from "@/lib/onboarding";
import { TOURS, type TourId, type TourStep } from "@/lib/tours";

// Opens a section's tour the first time it is ready, and lets it be replayed.
export function useSectionTour(id: TourId, ready: boolean, email = "") {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!ready || onboarding.tourDone(id, email)) return;
    // A moment's wait so the page has laid itself out before we point at things.
    const timer = setTimeout(() => setOpen(true), 400);
    return () => clearTimeout(timer);
  }, [id, ready, email]);
  const close = useCallback(() => {
    onboarding.setTourDone(id, email);
    setOpen(false);
  }, [id, email]);
  return { open, start: () => setOpen(true), close, steps: TOURS[id] as TourStep[] };
}

// The small "?" in a header that replays the tour.
export function TourButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Show the tour"
      aria-label="Show the tour"
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-slate-500 ring-1 ring-slate-300 hover:bg-slate-100 hover:text-slate-800"
    >
      ?
    </button>
  );
}

type Box = { top: number; left: number; width: number; height: number };

// The first element for this target that is actually showing (some pages render a toolbar twice).
function findTarget(target: string | undefined) {
  if (!target) return null;
  for (const el of document.querySelectorAll(`[data-tour="${target}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

export function Tour({ open, steps, onClose }: { open: boolean; steps: TourStep[]; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const el = findTarget(steps[step]?.target);
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.top < 60 || r.bottom > window.innerHeight - 200) el.scrollIntoView({ block: "center" });
    }
    function measure() {
      const r = findTarget(steps[step]?.target)?.getBoundingClientRect();
      setBox(r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null);
    }
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, step, steps]);

  // The tour never blocks the page: a click anywhere outside the tip closes it and still
  // goes through, so tabs, links and buttons keep working.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onPointer = (e: PointerEvent) => {
      if (!tipRef.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, [open, onClose]);

  if (!open || !steps[step]) return null;
  const last = step === steps.length - 1;
  const pad = 6;
  const tipWidth = 320;
  const width = `min(${tipWidth}px, calc(100vw - 32px))`;
  let tipStyle: React.CSSProperties = { top: "50%", left: "50%", transform: "translate(-50%, -50%)", width };
  if (box) {
    const left = Math.max(16, Math.min(box.left, window.innerWidth - tipWidth - 16));
    // Below the highlighted spot if there's room, otherwise above it.
    const below = box.top + box.height + pad + 10;
    tipStyle =
      below + 190 < window.innerHeight
        ? { top: below, left, width }
        : { bottom: window.innerHeight - box.top + pad + 10, left, width };
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-50" role="dialog" aria-label="Quick tour">
      {box ? (
        <div
          className="pointer-events-none absolute rounded-lg ring-4 ring-emerald-400 transition-all"
          style={{
            top: box.top - pad,
            left: box.left - pad,
            width: box.width + pad * 2,
            height: box.height + pad * 2,
            boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.45)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-slate-900/45" />
      )}
      <div ref={tipRef} className="pointer-events-auto absolute rounded-xl bg-white p-4 shadow-xl" style={tipStyle}>
        {steps.length > 1 && (
          <p className="text-xs font-medium text-slate-500">
            {step + 1} of {steps.length}
          </p>
        )}
        <p className="mt-1 font-semibold">{steps[step].title}</p>
        <p className="mt-1 text-sm text-slate-600">{steps[step].text}</p>
        <div className="mt-4 flex items-center gap-2">
          {!last && (
            <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-800">
              Skip tour
            </button>
          )}
          <span className="flex-1" />
          {step > 0 && (
            <button onClick={() => setStep(step - 1)} className="rounded-md px-3 py-1.5 text-sm hover:bg-slate-100">
              Back
            </button>
          )}
          <button
            onClick={() => (last ? onClose() : setStep(step + 1))}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700"
          >
            {last ? "Got it" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
