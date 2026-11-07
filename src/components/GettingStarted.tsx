"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

export type ChecklistStep = {
  done: boolean;
  label: string;
  hint: string;
  // What the highlighted "next step" button does: open a page, or run something here.
  action?: { label: string; href?: string | null; onClick?: () => void };
};

function headline(done: number, total: number) {
  const left = total - done;
  if (done === 0) return "Let's get you started";
  if (left === 1) return "One step left!";
  if (done * 2 === total) return "Halfway there";
  return done * 2 < total ? "Nice start!" : "Almost there";
}

// A friendly "Getting started" card. Finished steps get a green tick, the next one is highlighted
// with a button, and finishing everything shows a short celebration once before the card goes away.
export function ChecklistCard(props: {
  id: string;
  userEmail?: string;
  steps: ChecklistStep[];
}) {
  const { id, userEmail = "", steps } = props;
  const [hidden, setHidden] = useState(true);
  const [celebrate, setCelebrate] = useState(false);
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;

  useEffect(() => {
    setHidden(onboarding.checklistHidden(id, userEmail));
  }, [id, userEmail]);

  // The moment everything is done: celebrate this once, and don't show the card again after.
  useEffect(() => {
    if (!allDone || hidden) return;
    setCelebrate(true);
    onboarding.hideChecklist(id, userEmail);
  }, [allDone, hidden, id, userEmail]);

  if (celebrate) {
    return (
      <section className="mb-5 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <span className="text-2xl" aria-hidden>
          🎉
        </span>
        <div className="flex-1">
          <p className="font-semibold text-emerald-900">You&apos;re all set!</p>
          <p className="text-sm text-emerald-800">You&apos;ve tried everything here. Enjoy learning.</p>
        </div>
        <button
          onClick={() => setCelebrate(false)}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-emerald-900 hover:bg-emerald-100"
        >
          Close
        </button>
      </section>
    );
  }
  if (hidden || allDone) return null;

  const next = steps.findIndex((s) => !s.done);

  return (
    <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <h2 className="font-semibold">{headline(doneCount, steps.length)}</h2>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex flex-1 gap-1">
              {/* Fills from the left by how many are done, whichever steps they are. */}
              {steps.map((_, i) => (
                <span key={i} className={`h-1.5 flex-1 rounded-full ${i < doneCount ? "bg-emerald-400" : "bg-slate-100"}`} />
              ))}
            </div>
            <span className="text-xs whitespace-nowrap text-slate-400">
              {doneCount} of {steps.length}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => {
              onboarding.hideChecklist(id, userEmail);
              setHidden(true);
            }}
            aria-label="Hide getting started"
            title="Hide"
            className="rounded-md px-2 py-1 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        </div>
      </div>

      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {steps.map((s, i) => {
          const isNext = i === next;
          const a = s.action;
          return (
            <li
              key={s.label}
              className={`flex flex-wrap items-start gap-2.5 rounded-xl p-2.5 sm:flex-nowrap ${isNext ? "bg-emerald-50 ring-1 ring-emerald-200 sm:col-span-2" : ""}`}
            >
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  s.done ? "bg-emerald-500 text-white" : isNext ? "border-2 border-emerald-400 bg-white" : "border-2 border-slate-200"
                }`}
              >
                {s.done ? "✓" : ""}
              </span>
              <span className="min-w-0 flex-1 basis-40">
                <span className={`block text-sm ${s.done ? "text-slate-500" : "font-medium text-slate-800"}`}>{s.label}</span>
                {!s.done && <span className="block text-xs text-slate-500">{s.hint}</span>}
              </span>
              {isNext && a && (a.href || a.onClick) && (
                a.href ? (
                  <Link
                    href={a.href}
                    className="ml-7 shrink-0 self-center rounded-lg bg-emerald-600 sm:ml-0 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    {a.label}
                  </Link>
                ) : (
                  <button
                    onClick={a.onClick}
                    className="ml-7 shrink-0 self-center rounded-lg bg-emerald-600 sm:ml-0 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    {a.label}
                  </button>
                )
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
