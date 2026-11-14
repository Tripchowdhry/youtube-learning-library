"use client";

// Saved, Copy and Download (Word or PDF) for typed notes, the same as in Report Writer.

import { useState } from "react";
import { Copy } from "lucide-react";
import DownloadMenu from "@/components/DownloadMenu";
import { copyReport } from "@/lib/report-export";

type SaveState = "saved" | "saving" | "unsaved" | "error";

export default function NotesExport({
  saveState,
  onRetry,
  title,
  makeDocument,
  resolve,
  empty,
}: {
  saveState: SaveState;
  onRetry: () => void;
  title: string;
  // Built only when it's needed, so typing stays fast.
  makeDocument: () => string;
  resolve: (src: string) => string;
  empty: boolean;
}) {
  const [toast, setToast] = useState<{ text: string; isError?: boolean } | null>(null);

  function notify(text: string, isError = false) {
    setToast({ text, isError });
    setTimeout(() => setToast(null), 3000);
  }

  async function copy() {
    try {
      await copyReport(makeDocument(), resolve);
      notify("Copied. Paste it into Word, Google Docs or an email.");
    } catch {
      notify("Couldn't copy. Select the text and copy it instead.", true);
    }
  }


  return (
    <div className="flex items-center gap-2">
      {saveState === "error" ? (
        <button onClick={onRetry} className="text-xs font-medium text-red-600 underline">
          Not saved. Tap to retry
        </button>
      ) : (
        <span className="text-xs text-slate-500" title="Your notes save themselves as you type">
          {saveState === "saved" ? "Saved" : "Saving…"}
        </span>
      )}
      <button
        onClick={copy}
        disabled={empty}
        className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-sm hover:bg-slate-50 disabled:opacity-50"
      >
        <Copy size={14} aria-hidden /> Copy
      </button>
      <DownloadMenu title={title} makeDocument={makeDocument} resolve={resolve} disabled={empty} onError={(m) => notify(m, true)} />
      {toast && (
        <div
          className={`fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-lg px-4 py-2 text-sm text-white shadow-lg ${toast.isError ? "bg-red-600" : "bg-slate-900"}`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}
