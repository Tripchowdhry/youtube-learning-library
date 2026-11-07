"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useState } from "react";
import { onboarding, SAMPLE_VIDEO } from "@/lib/onboarding";

// ---------- Welcome screen for an empty library ----------

export function WelcomePanel({ onAddSample }: { onAddSample: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-10">
      <h2 className="text-2xl font-bold">Welcome to your shelf</h2>
      <p className="mx-auto mt-2 max-w-md text-slate-600">
        Paste a YouTube link in the box above to save your first video. BrainShelf fills in the title and puts it in a
        folder named after the channel.
      </p>
      <div className="mx-auto mt-6 grid max-w-2xl gap-3 text-left sm:grid-cols-3">
        <Feature title="Save" text="Videos here, articles and tutorials in the other tabs." />
        <Feature title="Take notes" text="Open a video to write or draw notes beside it, with time stamps." />
        <Feature title="Ask AI" text="Get a summary, or ask what a moment in the video means." />
      </div>
      <p className="mt-6 text-sm text-slate-500">Not sure what to add yet?</p>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await onAddSample();
          setBusy(false);
        }}
        className="mt-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
      >
        {busy ? "Adding…" : `Try a sample video: ${SAMPLE_VIDEO.label}`}
      </button>
    </div>
  );
}

function Feature({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-slate-600">{text}</p>
    </div>
  );
}

// ---------- Getting-started checklist ----------

export function GettingStartedChecklist(props: {
  userEmail: string;
  hasVideo: boolean;
  firstVideoId: string | null;
  hasNote: boolean;
  hasArticle: boolean;
  onShowTour: () => void;
}) {
  const { userEmail, hasVideo, firstVideoId, hasNote, hasArticle, onShowTour } = props;
  const [hidden, setHidden] = useState(true);
  const [triedAi, setTriedAi] = useState(false);
  useEffect(() => {
    setHidden(onboarding.checklistHidden(userEmail));
    setTriedAi(onboarding.triedAi());
  }, [userEmail]);

  const studyLink = firstVideoId ? `/video/${firstVideoId}` : null;
  const steps = [
    { done: hasVideo, label: "Save your first video", hint: "Paste a link in the box above." },
    { done: hasNote, label: "Take a note on a video", hint: "Open a video and write or draw beside it.", href: studyLink },
    { done: triedAi, label: "Ask AI about a video", hint: "On a video's page, tap Ask AI for a summary.", href: studyLink },
    { done: hasArticle, label: "Save an article to Reading", hint: "Switch to Reading and paste any web link.", href: "/reading" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (hidden || doneCount === steps.length) return null;

  return (
    <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="whitespace-nowrap font-semibold">Getting started</h2>
        <span className="whitespace-nowrap text-sm text-slate-500">
          {doneCount} of {steps.length} done
        </span>
        <div className="order-last h-1.5 basis-full overflow-hidden rounded-full bg-slate-100 sm:order-none sm:basis-0 sm:flex-1">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
        </div>
        <span className="ml-auto flex gap-3 sm:ml-0">
          <button onClick={onShowTour} className="text-sm text-slate-500 underline hover:text-slate-800">
            Show tour
          </button>
          <button
            onClick={() => {
              onboarding.hideChecklist(userEmail);
              setHidden(true);
            }}
            className="text-sm text-slate-500 underline hover:text-slate-800"
          >
            Hide
          </button>
        </span>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {steps.map((s) => {
          const body = (
            <>
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${
                  s.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300"
                }`}
              >
                {s.done ? "✓" : ""}
              </span>
              <span>
                <span className={`block text-sm font-medium ${s.done ? "text-slate-400 line-through" : ""}`}>{s.label}</span>
                {!s.done && <span className="block text-xs text-slate-500">{s.hint}</span>}
              </span>
            </>
          );
          const cls = "flex items-start gap-2 rounded-lg p-2";
          return (
            <li key={s.label}>
              {!s.done && s.href ? (
                <Link href={s.href} className={`${cls} hover:bg-slate-50`}>
                  {body}
                </Link>
              ) : (
                <div className={cls}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------- Short tour ----------

const TOUR = [
  {
    target: "add-video",
    title: "Save what you're learning",
    text: "Paste any YouTube link here. BrainShelf fills in the details and sorts it into a folder by channel.",
  },
  {
    target: "sections",
    title: "Not just videos",
    text: "Switch here to save articles, posts and tutorials, each with their own categories.",
  },
  {
    target: "search",
    title: "Find it again",
    text: "Search everything you've saved, including your notes. Open any video to take notes beside it and Ask AI.",
  },
];

type Box = { top: number; left: number; width: number; height: number };

export function Tour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [box, setBox] = useState<Box | null>(null);

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    function measure() {
      const el = document.querySelector(`[data-tour="${TOUR[step].target}"]`);
      const r = el?.getBoundingClientRect();
      setBox(r && r.width > 0 ? { top: r.top, left: r.left, width: r.width, height: r.height } : null);
    }
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, step]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const last = step === TOUR.length - 1;
  const pad = 6;
  const tipWidth = 320;
  const tipStyle: React.CSSProperties = box
    ? {
        top: box.top + box.height + pad + 10,
        left: Math.max(16, Math.min(box.left, window.innerWidth - tipWidth - 16)),
        width: `min(${tipWidth}px, calc(100vw - 32px))`,
      }
    : { top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: `min(${tipWidth}px, calc(100vw - 32px))` };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-label="Quick tour">
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
      <div className="absolute rounded-xl bg-white p-4 shadow-xl" style={tipStyle}>
        <p className="text-xs font-medium text-slate-500">
          {step + 1} of {TOUR.length}
        </p>
        <p className="mt-1 font-semibold">{TOUR[step].title}</p>
        <p className="mt-1 text-sm text-slate-600">{TOUR[step].text}</p>
        <div className="mt-4 flex items-center gap-2">
          <button onClick={onClose} className="mr-auto text-sm text-slate-500 hover:text-slate-800">
            Skip tour
          </button>
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
