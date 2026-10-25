"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import NotePageCanvas, { PAGE_HEIGHT, type Tool } from "@/components/NotePageCanvas";
import { createClient } from "@/lib/supabase/client";
import { loadYouTubeApi, type YouTubePlayer } from "@/lib/youtube-player";
import type { NotePage, NoteStroke, Video } from "@/lib/types";

const PEN_COLORS = ["#111827", "#2563eb", "#dc2626", "#16a34a"];
const HIGHLIGHT_COLORS = ["#facc15", "#4ade80", "#f472b6", "#60a5fa"];
const SIZES = [
  { label: "Fine", value: 2 },
  { label: "Medium", value: 4 },
  { label: "Bold", value: 7 },
];
const emptyPage = (): NotePage => ({ strokes: [], stamps: [] });

type SaveState = "saved" | "saving" | "unsaved" | "error";

export default function StudyPage({ videoId }: { videoId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [video, setVideo] = useState<Video | null>(null);
  const [missing, setMissing] = useState(false);
  const [pages, setPages] = useState<NotePage[]>([emptyPage()]);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");

  const [tool, setTool] = useState<Tool>("pen");
  const [penColor, setPenColor] = useState(PEN_COLORS[0]);
  const [highlightColor, setHighlightColor] = useState(HIGHLIGHT_COLORS[0]);
  const [size, setSize] = useState(SIZES[0].value);
  const [fingerDraws, setFingerDraws] = useState(false);
  const [notesHidden, setNotesHidden] = useState(false);

  const history = useRef<NotePage[][]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const lastSpot = useRef<{ page: number; y: number }>({ page: 0, y: 40 });

  const playerHost = useRef<HTMLDivElement>(null);
  const player = useRef<YouTubePlayer | null>(null);

  // ---------- Load the video and its notes ----------

  useEffect(() => {
    (async () => {
      const [v, n] = await Promise.all([
        supabase.from("videos").select("*").eq("id", videoId).maybeSingle(),
        supabase.from("notes").select("pages").eq("video_id", videoId).maybeSingle(),
      ]);
      if (!v.data) {
        setMissing(true);
        return;
      }
      setVideo(v.data as Video);
      const saved = (n.data?.pages ?? []) as NotePage[];
      if (saved.length) setPages(saved);
      setLoaded(true);
    })();
  }, [supabase, videoId]);

  // ---------- YouTube player ----------

  useEffect(() => {
    if (!video || !playerHost.current) return;
    let cancelled = false;
    const host = document.createElement("div");
    playerHost.current.appendChild(host);
    loadYouTubeApi().then((YT) => {
      if (cancelled) return;
      player.current = new YT.Player(host, {
        videoId: video.youtube_id,
        width: "100%",
        height: "100%",
        playerVars: { playsinline: 1, rel: 0 },
      });
    });
    return () => {
      cancelled = true;
      player.current?.destroy();
      player.current = null;
      host.remove();
    };
  }, [video]);

  // ---------- Saving ----------

  const pagesRef = useRef(pages);
  pagesRef.current = pages;

  const save = useCallback(async () => {
    setSaveState("saving");
    const { error } = await supabase
      .from("notes")
      .upsert(
        { video_id: videoId, pages: pagesRef.current, updated_at: new Date().toISOString() },
        { onConflict: "video_id" },
      );
    setSaveState(error ? "error" : "saved");
  }, [supabase, videoId]);

  useEffect(() => {
    if (saveState !== "unsaved") return;
    const timer = setTimeout(save, 1200);
    return () => clearTimeout(timer);
  }, [pages, saveState, save]);

  // Save right away if the person switches apps or closes the tab.
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === "hidden" && saveState === "unsaved") save();
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, [saveState, save]);

  function change(next: NotePage[]) {
    history.current.push(pages);
    if (history.current.length > 100) history.current.shift();
    setCanUndo(true);
    setPages(next);
    setSaveState("unsaved");
  }

  function undo() {
    const previous = history.current.pop();
    if (!previous) return;
    setCanUndo(history.current.length > 0);
    setPages(previous);
    setSaveState("unsaved");
  }

  // ---------- Notebook actions ----------

  function addStroke(pageIndex: number, stroke: NoteStroke) {
    const bottom = Math.max(...stroke.points.map((p) => p[1]));
    lastSpot.current = { page: pageIndex, y: bottom };
    change(pages.map((p, i) => (i === pageIndex ? { ...p, strokes: [...p.strokes, stroke] } : p)));
  }

  function eraseStrokes(pageIndex: number, indexes: number[]) {
    const gone = new Set(indexes);
    change(pages.map((p, i) => (i === pageIndex ? { ...p, strokes: p.strokes.filter((_, j) => !gone.has(j)) } : p)));
  }

  function stampTime() {
    const seconds = player.current?.getCurrentTime?.() ?? 0;
    let { page, y } = lastSpot.current;
    y += 50;
    let next = pages;
    if (y > PAGE_HEIGHT - 40) {
      // No room left on this page: start the next one.
      page += 1;
      y = 80;
      if (page >= pages.length) next = [...pages, emptyPage()];
    }
    lastSpot.current = { page, y };
    const stamp = { id: crypto.randomUUID(), t: Math.round(seconds), x: 95, y };
    change(next.map((p, i) => (i === page ? { ...p, stamps: [...p.stamps, stamp] } : p)));
  }

  function tapStamp(pageIndex: number, stampId: string, seconds: number) {
    if (tool === "eraser") {
      change(pages.map((p, i) => (i === pageIndex ? { ...p, stamps: p.stamps.filter((s) => s.id !== stampId) } : p)));
      return;
    }
    player.current?.seekTo(seconds, true);
    player.current?.playVideo();
  }

  function addPage() {
    change([...pages, emptyPage()]);
    lastSpot.current = { page: pages.length, y: 40 };
  }

  function clearPage(pageIndex: number) {
    if (!window.confirm(`Erase everything on page ${pageIndex + 1}?`)) return;
    change(
      pages.length > 1 && pageIndex === pages.length - 1
        ? pages.slice(0, -1)
        : pages.map((p, i) => (i === pageIndex ? emptyPage() : p)),
    );
  }

  // ---------- Render ----------

  if (missing) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="mb-2 text-2xl font-bold">Video not found</h1>
        <p className="mb-6 text-slate-600">It may have been removed from your library.</p>
        <Link href="/" className="underline">
          Back to your library
        </Link>
      </main>
    );
  }

  const toolbar = (
    <Toolbar
      tool={tool}
      setTool={setTool}
      color={tool === "highlighter" ? highlightColor : penColor}
      setColor={tool === "highlighter" ? setHighlightColor : setPenColor}
      colors={tool === "highlighter" ? HIGHLIGHT_COLORS : PEN_COLORS}
      size={size}
      setSize={setSize}
      canUndo={canUndo}
      onUndo={undo}
      onStamp={stampTime}
      fingerDraws={fingerDraws}
      setFingerDraws={setFingerDraws}
    />
  );

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4">
        <Link href="/" className="shrink-0 rounded-md px-2 py-1 text-sm hover:bg-slate-100">
          ← Library
        </Link>
        <h1 className="min-w-0 flex-1 truncate font-semibold">{video?.title ?? "Loading…"}</h1>
        <SaveBadge state={saveState} onRetry={save} />
        <button
          onClick={() => setNotesHidden((h) => !h)}
          className="shrink-0 rounded-md px-2.5 py-1 text-sm ring-1 ring-slate-300 hover:bg-slate-100"
        >
          {notesHidden ? "Show notes" : "Hide notes"}
        </button>
      </header>

      <div
        className={`gap-5 p-3 md:p-5 ${notesHidden ? "" : "lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]"}`}
      >
        {/* Video: sticky on top in portrait, sticky on the left in landscape. */}
        <div
          className={
            notesHidden
              ? ""
              : "sticky top-14 z-20 -mx-3 bg-slate-100 px-3 pb-2 md:-mx-5 md:px-5 lg:top-[76px] lg:mx-0 lg:self-start lg:px-0"
          }
        >
          <div
            ref={playerHost}
            className="relative mx-auto aspect-video overflow-hidden rounded-lg bg-black [&_iframe]:absolute [&_iframe]:inset-0 [&_iframe]:h-full [&_iframe]:w-full"
            // The player keeps the same element when notes are hidden, so playback isn't interrupted.
            style={{ width: notesHidden ? "min(100%, calc((100vh - 110px) * 16 / 9))" : "min(100%, calc(34vh * 16 / 9))" }}
          />
          <div className={notesHidden ? "hidden" : "mt-2 hidden lg:block"}>
            {video?.channel && <p className="text-sm text-slate-500">{video.channel}</p>}
            {video && (
              <a href={video.url} target="_blank" rel="noreferrer" className="text-sm text-slate-500 underline">
                Open on YouTube
              </a>
            )}
          </div>
          <div className={notesHidden ? "hidden" : "mt-2 lg:hidden"}>{toolbar}</div>
        </div>

        <div className={notesHidden ? "hidden" : "mt-2 flex min-w-0 flex-col gap-4 lg:mt-0"}>
          <div className="sticky top-[76px] z-20 hidden lg:block">{toolbar}</div>
          {!loaded ? (
            <p className="text-slate-500">Loading your notes…</p>
          ) : (
            <>
              {pages.map((page, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between px-1 text-xs text-slate-500">
                    <span>Page {i + 1}</span>
                    <button onClick={() => clearPage(i)} className="rounded px-1.5 py-0.5 hover:bg-slate-200">
                      {pages.length > 1 && i === pages.length - 1 ? "Delete page" : "Clear page"}
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
                    onStampTap={(id, t) => tapStamp(i, id, t)}
                  />
                </div>
              ))}
              <button
                onClick={addPage}
                className="rounded-lg border-2 border-dashed border-slate-300 py-4 text-sm font-medium text-slate-600 hover:bg-white"
              >
                + Add page
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Toolbar(props: {
  tool: Tool;
  setTool: (t: Tool) => void;
  color: string;
  setColor: (c: string) => void;
  colors: string[];
  size: number;
  setSize: (s: number) => void;
  canUndo: boolean;
  onUndo: () => void;
  onStamp: () => void;
  fingerDraws: boolean;
  setFingerDraws: (v: boolean) => void;
}) {
  const tools: { id: Tool; label: string }[] = [
    { id: "pen", label: "Pen" },
    { id: "highlighter", label: "Highlighter" },
    { id: "eraser", label: "Eraser" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-2 shadow-sm ring-1 ring-slate-200">
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
      <button
        onClick={props.onStamp}
        className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700"
        title="Pin the video's current time onto your notes"
      >
        ⏱ Stamp time
      </button>
      <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-600">
        <input
          id="finger-draws"
          type="checkbox"
          checked={props.fingerDraws}
          onChange={(e) => props.setFingerDraws(e.target.checked)}
        />
        Draw with finger
      </label>
    </div>
  );
}

function SaveBadge({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state === "error") {
    return (
      <button onClick={onRetry} className="shrink-0 text-xs text-red-600 underline">
        Not saved. Tap to retry
      </button>
    );
  }
  const text = state === "saved" ? "Saved" : "Saving…";
  return <span className="shrink-0 text-xs text-slate-500">{text}</span>;
}

