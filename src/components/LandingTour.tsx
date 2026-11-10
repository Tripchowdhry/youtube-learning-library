"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  Compass,
  Eye,
  FileText,
  Link2,
  LockKeyhole,
  NotebookPen,
  Pencil,
  X,
  type LucideIcon,
} from "lucide-react";
import { Ico, type Tone } from "@/components/Icon";

type Slide = {
  icon: LucideIcon;
  tone: Tone;
  title: string;
  text: string;
  src: string;
  alt: string;
};

const SLIDES: Slide[] = [
  {
    icon: Link2,
    tone: "sky",
    title: "Paste a link",
    text: "A YouTube video, an article, an X post or a tutorial. BrainShelf fills in the title and keeps it on your shelf, sorted into categories.",
    src: "/landing/videos.webp",
    alt: "Your video library, with categories, notes and summaries",
  },
  {
    icon: Pencil,
    tone: "yellow",
    title: "Take notes beside the video",
    text: "Watch on the left, write on the right. Stamp the time to jump back later, handwrite with a pen, or ask AI for a summary or a quiz.",
    src: "/landing/study.webp",
    alt: "The notes page: a video on the left, notes and Ask AI on the right",
  },
  {
    icon: FileText,
    tone: "sky",
    title: "Articles and tutorials too",
    text: "Save posts, articles and how-to guides in their own tabs. Add a line on why you saved it, and tick it off when you're done.",
    src: "/landing/reading.webp",
    alt: "The Reading tab with categories, notes and read ticks",
  },
  {
    icon: NotebookPen,
    tone: "orange",
    title: "A ScrapBook for your own ideas",
    text: "Pages of your own for plans, ideas and sketches. Type freely or draw, and sort pages into categories.",
    src: "/landing/scrapbook.webp",
    alt: "The ScrapBook with pages sorted into categories",
  },
  {
    icon: LockKeyhole,
    tone: "yellow",
    title: "Securely save your API keys",
    text: "The Vault keeps your API keys and logins locked with your own passphrase, in your browser, so nobody else can read them, not even BrainShelf.",
    src: "/landing/vault.webp",
    alt: "The Vault, locked, with an API key and a login saved",
  },
];

// A short picture tour of BrainShelf for people who haven't signed in yet, opened from the FAQ.
export default function LandingTour() {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const last = i === SLIDES.length - 1;
  const s = SLIDES[i];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowRight")
        setI((n) => Math.min(n + 1, SLIDES.length - 1));
      if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const finish = () => {
    setOpen(false);
    document.getElementById("start")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setI(0);
          setOpen(true);
        }}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700"
      >
        <Ico icon={Compass} tone="red" size={16} />
        Take the tour
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3"
            onClick={() => setOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="BrainShelf tour"
          >
            <div
              className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2.5">
                <span className="flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
                  <Ico icon={Eye} tone="slate" size={13} />
                  Preview of the app
                </span>
                <span className="text-sm text-slate-500">
                  {i + 1} of {SLIDES.length}
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="ml-auto rounded-md p-1 text-slate-500 hover:bg-slate-100"
                  aria-label="Close the tour"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="overflow-y-auto">
                <img
                  src={s.src}
                  alt={s.alt}
                  draggable={false}
                  className="block w-full select-none border-b border-slate-200"
                />
                <div className="p-5">
                  <h3 className="flex items-center gap-2 text-xl font-bold">
                    <Ico icon={s.icon} tone={s.tone} size={24} />
                    {s.title}
                  </h3>
                  <p className="mt-1 text-slate-600">{s.text}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 border-t border-slate-200 px-4 py-3">
                <div className="flex gap-1.5">
                  {SLIDES.map((sl, n) => (
                    <button
                      key={sl.title}
                      type="button"
                      onClick={() => setI(n)}
                      aria-label={`Go to step ${n + 1}`}
                      className={`h-2 rounded-full transition-all ${n === i ? "w-5 bg-slate-900" : "w-2 bg-slate-300 hover:bg-slate-400"}`}
                    />
                  ))}
                </div>
                {i > 0 && (
                  <button
                    type="button"
                    onClick={() => setI(i - 1)}
                    className="ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
                  >
                    <ArrowLeft size={16} /> Back
                  </button>
                )}
                <button
                  type="button"
                  onClick={last ? finish : () => setI(i + 1)}
                  className={`${i > 0 ? "" : "ml-auto"} inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700`}
                >
                  {last ? "Start your shelf today" : "Next"}{" "}
                  {!last && <ArrowRight size={16} />}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
