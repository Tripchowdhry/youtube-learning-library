"use client";

// One Download button with a small menu: Word (to keep editing) or PDF (ready to send).
// Used by Report Writer, shared reports and the notes on videos, readings, tutorials and ScrapBook pages.

import { ChevronDown, FileDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { downloadPdf, downloadWord } from "@/lib/report-export";

type Resolve = (src: string) => string;

export default function DownloadMenu({
  title,
  makeDocument,
  resolve,
  disabled,
  onError,
  variant = "primary",
}: {
  title: string;
  // Built only when it's needed, so typing stays fast.
  makeDocument: () => string;
  resolve: Resolve;
  disabled?: boolean;
  onError: (message: string) => void;
  // "plain" is the outlined look, for the shared report page.
  variant?: "primary" | "plain";
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"word" | "pdf" | null>(null);
  const box = useRef<HTMLDivElement>(null);

  // Closes when you click or tap anywhere else.
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => box.current?.contains(e.target as Node) || setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  async function download(kind: "word" | "pdf") {
    setOpen(false);
    setBusy(kind);
    try {
      await (kind === "word" ? downloadWord : downloadPdf)(title, makeDocument(), resolve);
    } catch {
      onError(`Couldn't make the ${kind === "word" ? "Word file" : "PDF"}. Try again.`);
    } finally {
      setBusy(null);
    }
  }

  const look =
    variant === "primary"
      ? "bg-blue-600 font-medium text-white hover:bg-blue-700"
      : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50";
  return (
    <div ref={box} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={disabled || Boolean(busy)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm disabled:opacity-50 ${look}`}
      >
        <FileDown size={14} aria-hidden /> {busy ? "Making file…" : "Download"}
        {!busy && <ChevronDown size={14} aria-hidden />}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-1 w-52 rounded-lg bg-white p-1 text-left shadow-lg ring-1 ring-slate-200">
          <button role="menuitem" onClick={() => download("word")} className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-50">
            <span className="font-medium text-slate-900">Word</span> <span className="text-slate-500">· to keep editing</span>
          </button>
          <button role="menuitem" onClick={() => download("pdf")} className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-50">
            <span className="font-medium text-slate-900">PDF</span> <span className="text-slate-500">· ready to send</span>
          </button>
        </div>
      )}
    </div>
  );
}
