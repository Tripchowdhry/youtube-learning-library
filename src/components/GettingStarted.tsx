"use client";

import { useState } from "react";
import { SAMPLE_VIDEO } from "@/lib/onboarding";

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
