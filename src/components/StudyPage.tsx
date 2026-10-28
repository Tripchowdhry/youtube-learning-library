"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import NotePageCanvas, { PAGE_HEIGHT, type Tool } from "@/components/NotePageCanvas";
import { DeleteClipButton } from "@/components/ClipButtons";
import {
  clipUrl,
  compressImage,
  joinTypedClips,
  splitTypedClips,
  uploadClip,
  type ClipImage,
  type TypedClip,
} from "@/lib/clips";
import { createClient } from "@/lib/supabase/client";
import { formatTime, loadYouTubeApi, type YouTubePlayer } from "@/lib/youtube-player";
import type { NoteImage, NotePage, NoteStroke, Video } from "@/lib/types";
import { onAiJobDone, runAiJob, useAiJobs, useSecondsSince } from "@/lib/ai-jobs";
import { askVideoAi } from "@/lib/video-ai";
import { askConfirm } from "./ConfirmDialog";

const PEN_COLORS = ["#111827", "#2563eb", "#dc2626", "#16a34a"];
const HIGHLIGHT_COLORS = ["#facc15", "#4ade80", "#f472b6", "#60a5fa"];
const SIZES = [
  { label: "Fine", value: 2 },
  { label: "Medium", value: 4 },
  { label: "Bold", value: 7 },
];
const emptyPage = (): NotePage => ({ strokes: [], stamps: [] });

type SaveState = "saved" | "saving" | "unsaved" | "error";
type Mode = "write" | "type";

const MODE_KEY = "notes-mode";

// The Mac shortcut (in Apple's Shortcuts app) that Clip runs to start a screenshot.
const MAC_SHORTCUT = "Clip Video";

// The mode last picked on this device; otherwise typing when there's a mouse or
// trackpad, and handwriting on touch-only devices like an iPad.
function preferredMode(): Mode {
  try {
    const stored = localStorage.getItem(MODE_KEY);
    if (stored === "write" || stored === "type") return stored;
  } catch {
    // Fall through to the device default.
  }
  return window.matchMedia("(any-pointer: fine)").matches ? "type" : "write";
}

// Typed notes mark video times as [m:ss] or [h:mm:ss].
const TIME_PATTERN = /\[(\d+):(\d{2})(?::(\d{2}))?\]/g;

// "screenshot at 1:01", "take a picture at 12:30": the first time mentioned, in seconds.
const SHOT_PATTERN = /\b(screen ?shots?|pictures?|snap|images?|frames?)\b/i;
const ANY_TIME = /(\d+):(\d{2})(?::(\d{2}))?/;

function screenshotTime(prompt: string) {
  if (!SHOT_PATTERN.test(prompt)) return null;
  const m = prompt.match(ANY_TIME);
  if (!m) return null;
  const [a, b, c] = [Number(m[1]), Number(m[2]), m[3] === undefined ? null : Number(m[3])];
  return c === null ? a * 60 + b : a * 3600 + b * 60 + c;
}

// Adds an AI answer to the end of the typed notes.
function addAnswer(typed: string, answer: string) {
  const current = typed.trimEnd();
  return `${current ? `${current}\n\n` : ""}${answer}`;
}

function timesIn(text: string) {
  const seen = new Set<number>();
  for (const m of text.matchAll(TIME_PATTERN)) {
    const [a, b, c] = [Number(m[1]), Number(m[2]), m[3] === undefined ? null : Number(m[3])];
    seen.add(c === null ? a * 60 + b : a * 3600 + b * 60 + c);
  }
  return Array.from(seen);
}

export default function StudyPage({ videoId }: { videoId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [video, setVideo] = useState<Video | null>(null);
  const [missing, setMissing] = useState(false);
  const [pages, setPages] = useState<NotePage[]>([emptyPage()]);
  const [typed, setTyped] = useState("");
  const [typedClips, setTypedClips] = useState<TypedClip[]>([]);
  const [mode, setMode] = useState<Mode>("write");
  const typedBox = useRef<HTMLTextAreaElement>(null);
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

  const [clipBusy, setClipBusy] = useState(false);
  const pictureInput = useRef<HTMLInputElement>(null);
  // iPad: after the first Clip tap the video waits, paused, for the screenshot to be pasted.
  const [waitingForPaste, setWaitingForPaste] = useState(false);
  const resumeAfterClip = useRef(false);
  // The link that starts a drag-to-select screenshot on this computer, if there is one.
  const [screenshotLink, setScreenshotLink] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const aiJobs = useAiJobs();
  const aiKey = `ask:${videoId}`;
  const aiStartedAt = aiJobs.running.find((j) => j.key === aiKey)?.startedAt ?? null;
  const aiError = aiJobs.errors.get(aiKey) ?? null;

  const playerHost = useRef<HTMLDivElement>(null);
  const player = useRef<YouTubePlayer | null>(null);

  // ---------- Load the video and its notes ----------

  useEffect(() => {
    (async () => {
      const [v, n] = await Promise.all([
        supabase.from("videos").select("*").eq("id", videoId).maybeSingle(),
        supabase.from("notes").select("*").eq("video_id", videoId).maybeSingle(),
      ]);
      if (!v.data) {
        setMissing(true);
        return;
      }
      setVideo(v.data as Video);
      const saved = (n.data?.pages ?? []) as NotePage[];
      const savedText = (n.data?.text ?? "") as string;
      if (saved.length) setPages(saved);
      const { text, clips } = splitTypedClips(savedText);
      setTyped(text);
      setTypedClips(clips);
      setMode(preferredMode());
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
  const typedRef = useRef(typed);
  typedRef.current = typed;
  const typedClipsRef = useRef(typedClips);
  typedClipsRef.current = typedClips;

  const save = useCallback(async () => {
    setSaveState("saving");
    const { error } = await supabase.from("notes").upsert(
      {
        video_id: videoId,
        pages: pagesRef.current,
        text: joinTypedClips(typedRef.current, typedClipsRef.current),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "video_id" },
    );
    setSaveState(error ? "error" : "saved");
  }, [supabase, videoId]);

  useEffect(() => {
    if (saveState !== "unsaved") return;
    const timer = setTimeout(save, 1200);
    return () => clearTimeout(timer);
  }, [pages, typed, typedClips, saveState, save]);

  // Save right away when leaving for another page of the app.
  const saveStateRef = useRef(saveState);
  saveStateRef.current = saveState;
  useEffect(
    () => () => {
      if (saveStateRef.current === "unsaved") save();
    },
    [save],
  );

  // Save right away if the person switches apps or closes the tab.
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === "hidden" && saveState === "unsaved") save();
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, [saveState, save]);

  function change(next: NotePage[]) {
    history.current.push(pagesRef.current);
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

  function chooseMode(next: Mode) {
    setMode(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      // Storage can be blocked (private browsing); the choice just isn't remembered.
    }
  }

  function changeTyped(text: string) {
    setTyped(text);
    setSaveState("unsaved");
  }

  async function clearTyped() {
    const ok = await askConfirm({
      title: "Clear your typed notes?",
      message:
        "Everything you typed (and AI answers) for this video will be erased.\n\nYour pictures, handwriting and the short note in your library stay safe.",
      confirmLabel: "Yes, clear typed notes",
      cancelLabel: "Keep them",
      danger: true,
    });
    if (ok) changeTyped("");
  }

  // Typing mode: put [m:ss] at the cursor, on its own line.
  function stampTyped() {
    const box = typedBox.current;
    const seconds = player.current?.getCurrentTime?.() ?? 0;
    const at = box ? box.selectionStart : typed.length;
    const before = typed.slice(0, at);
    const after = typed.slice(at);
    const insert = `${before && !before.endsWith("\n") ? "\n" : ""}[${formatTime(seconds)}] `;
    changeTyped(before + insert + after);
    requestAnimationFrame(() => {
      if (!box) return;
      box.focus();
      box.selectionStart = box.selectionEnd = at + insert.length;
    });
  }

  function jumpTo(seconds: number) {
    player.current?.seekTo(seconds, true);
    player.current?.playVideo();
  }

  function stampTime() {
    if (mode === "type") return stampTyped();
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

  function tapStamp(pageIndex: number, id: string, seconds: number) {
    if (tool === "eraser") {
      change(
        pages.map((p, i) =>
          i === pageIndex
            ? {
                ...p,
                stamps: p.stamps.filter((s) => s.id !== id),
                images: (p.images ?? []).filter((im) => im.id !== id),
              }
            : p,
        ),
      );
      return;
    }
    jumpTo(seconds);
  }

  function changeTypedClips(clips: TypedClip[]) {
    setTypedClips(clips);
    setSaveState("unsaved");
  }

  const clipCount = typedClips.length + pages.reduce((n, p) => n + (p.images?.length ?? 0), 0);

  // Removes every clip from this video's notes, in both handwriting and typed notes.
  async function deleteAllClips() {
    const ok = await askConfirm({
      title: `Delete all ${clipCount} pictures?`,
      message: "Every picture in this video's notes will be removed. Your typed text and handwriting stay.",
      confirmLabel: "Yes, delete pictures",
      cancelLabel: "Keep them",
      danger: true,
    });
    if (!ok) return;
    if (pages.some((p) => p.images?.length)) change(pages.map((p) => ({ ...p, images: [] })));
    if (typedClips.length) changeTypedClips([]);
  }

  function deleteImage(pageIndex: number, imageId: string) {
    change(
      pages.map((p, i) => (i === pageIndex ? { ...p, images: (p.images ?? []).filter((im) => im.id !== imageId) } : p)),
    );
  }

  // ---------- Pictures (screenshots pasted into notes) ----------

  const flash = useCallback((text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(null), 4000);
  }, []);

  // Clip pauses the video so it's easy to screenshot, and plays it again once the picture is in.
  function startClip() {
    const playing = player.current?.getPlayerState?.() === 1;
    resumeAfterClip.current = playing;
    if (playing) player.current?.pauseVideo();
    // On a Mac or Windows PC, start the screenshot for them; they then press Cmd+V / Ctrl+V.
    // Elsewhere (iPad), they take the screenshot themselves and tap Clip again to paste it.
    if (screenshotLink) window.location.href = screenshotLink;
    else setWaitingForPaste(true);
  }

  function endClip() {
    setWaitingForPaste(false);
    if (resumeAfterClip.current) player.current?.playVideo();
    resumeAfterClip.current = false;
  }

  async function addClip(source: Blob, seconds: number) {
    setClipBusy(true);
    try {
      const image = await compressImage(source);
      const path = await uploadClip(supabase, image);
      if (mode === "type") insertTypedClip(path);
      else placeImage(image, path, seconds);
      endClip();
    } catch (error) {
      flash(`Couldn't save the picture: ${error instanceof Error ? error.message : "unknown error"}`);
    } finally {
      setClipBusy(false);
    }
  }

  function placeImage(image: ClipImage, path: string, seconds: number) {
    const current = pagesRef.current;
    const w = 640;
    const h = Math.round((w * image.height) / image.width);
    let { page, y } = lastSpot.current;
    y += 30;
    let next = current;
    if (y + h > PAGE_HEIGHT - 20) {
      page += 1;
      y = 60;
      if (page >= current.length) next = [...current, emptyPage()];
    }
    const im: NoteImage = {
      id: crypto.randomUUID(),
      path,
      x: 100,
      y,
      w,
      h,
      t: Math.round(seconds),
    };
    lastSpot.current = { page, y: y + h };
    change(next.map((p, i) => (i === page ? { ...p, images: [...(p.images ?? []), im] } : p)));
  }

  function insertTypedClip(path: string) {
    changeTypedClips([...typedClipsRef.current, { path, t: null }]);
  }

  // The second Clip tap on iPad. If the clipboard can't be read, pick a picture instead.
  async function pastePicture() {
    const seconds = player.current?.getCurrentTime?.() ?? 0;
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (type) {
          await addClip(await item.getType(type), seconds);
          return;
        }
      }
      flash("No picture copied yet. Take a screenshot of the video and copy it first.");
    } catch {
      pictureInput.current?.click();
    }
  }

  useEffect(() => {
    // Mac: the "Clip Video" shortcut in Apple's Shortcuts app. iPads also say "Macintosh", but have a touch screen.
    // Windows: the Snipping Tool.
    if (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints === 0) {
      setScreenshotLink(`shortcuts://run-shortcut?name=${encodeURIComponent(MAC_SHORTCUT)}`);
    } else if (/Windows/.test(navigator.userAgent)) {
      setScreenshotLink("ms-screenclip:");
    }
  }, []);

  // Pasting a picture anywhere on the page (Ctrl+V / Cmd+V / long-press Paste) adds it as a clip.
  const addClipRef = useRef(addClip);
  addClipRef.current = addClip;
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (!file) return;
      e.preventDefault();
      addClipRef.current(file, player.current?.getCurrentTime?.() ?? 0);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  // ---------- Ask AI ----------

  // The answer is added to the end of the typed notes. Asking for a screenshot at a time
  // also jumps the video there, paused, and starts Clip so the picture lands in the notes too.
  // The AI keeps working if the person leaves this page; the answer is then saved to the notes.
  function askAi(prompt: string) {
    if (!video || aiStartedAt !== null) return;
    const shotAt = screenshotTime(prompt);
    if (shotAt !== null) {
      player.current?.seekTo(shotAt, true);
      player.current?.pauseVideo();
      resumeAfterClip.current = false;
      if (screenshotLink) window.location.href = screenshotLink;
      else setWaitingForPaste(true);
    }
    setMode("type");
    runAiJob<string>({
      key: aiKey,
      label: `AI answer for "${video.title ?? "your video"}"`,
      work: async () => {
        const result = await askVideoAi({
          youtubeId: video.youtube_id,
          title: video.title,
          task: "ask",
          prompt,
          focusAt: shotAt ?? undefined,
        });
        if (result.error || !result.text) return { error: result.error ?? "The AI didn't answer." };
        const by = result.model ? ` (${result.model})` : "";
        return { result: `✨ ${prompt}${by}\n${result.text}\n` };
      },
      // This page was left: add the answer to the saved notes instead.
      fallback: async (answer) => {
        const { data } = await supabase.from("notes").select("pages, text").eq("video_id", videoId).maybeSingle();
        const saved = splitTypedClips((data?.text ?? "") as string);
        const { error } = await supabase.from("notes").upsert(
          {
            video_id: videoId,
            pages: data?.pages ?? [],
            text: joinTypedClips(addAnswer(saved.text, answer), saved.clips),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "video_id" },
        );
        if (error) throw error;
      },
    });
  }

  // An answer that arrives while this page is open goes straight into the typing box.
  useEffect(() => {
    if (!loaded) return;
    return onAiJobDone((key, answer) => {
      if (key !== `ask:${videoId}`) return false;
      setTyped(addAnswer(typedRef.current, answer as string));
      setSaveState("unsaved");
      requestAnimationFrame(() => {
        const box = typedBox.current;
        if (box) box.scrollTop = box.scrollHeight;
      });
      return true;
    });
  }, [loaded, videoId]);

  const imageUrl = useCallback((path: string) => clipUrl(supabase, path), [supabase]);

  function addPage() {
    change([...pages, emptyPage()]);
    lastSpot.current = { page: pages.length, y: 40 };
  }

  async function clearPage(pageIndex: number) {
    const ok = await askConfirm({
      title: `Erase page ${pageIndex + 1}?`,
      message: "All handwriting and pictures on this page will be erased. Other pages stay as they are.",
      confirmLabel: "Yes, erase page",
      cancelLabel: "Keep it",
      danger: true,
    });
    if (!ok) return;
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
      mode={mode}
      setMode={chooseMode}
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
      onClip={waitingForPaste ? pastePicture : startClip}
      waitingForPaste={waitingForPaste}
      onCancelClip={endClip}
      clipCount={clipCount}
      onDeleteAllClips={deleteAllClips}
      onClearTyped={typed.trim() ? clearTyped : null}
      clipBusy={clipBusy}
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

      <div className={`gap-5 p-3 md:p-5 ${notesHidden ? "" : "lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]"}`}>
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
            style={{
              width: notesHidden ? "min(100%, calc((100vh - 110px) * 16 / 9))" : "min(100%, calc(34vh * 16 / 9))",
            }}
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
          {loaded && (
            <AskAi startedAt={aiStartedAt} error={aiError} onAsk={askAi} currentTime={() => player.current?.getCurrentTime?.() ?? 0} />
          )}
          {!loaded ? (
            <p className="text-slate-500">Loading your notes…</p>
          ) : mode === "type" ? (
            <TypedNotes
              text={typed}
              onChange={changeTyped}
              onJump={jumpTo}
              boxRef={typedBox}
              onStamp={stampTyped}
              imageUrl={imageUrl}
              clips={typedClips}
              onClipsChange={changeTypedClips}
            />
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
                    imageUrl={imageUrl}
                    onDeleteImage={(id) => deleteImage(i, id)}
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

      <input
        ref={pictureInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) addClip(file, player.current?.getCurrentTime?.() ?? 0);
        }}
      />
      {(notice || clipBusy) && (
        <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
          {clipBusy ? "Saving picture…" : notice}
        </div>
      )}
    </div>
  );
}

function TypedNotes(props: {
  text: string;
  onChange: (text: string) => void;
  onJump: (seconds: number) => void;
  onStamp: () => void;
  boxRef: React.RefObject<HTMLTextAreaElement | null>;
  imageUrl: (path: string) => string;
  clips: TypedClip[];
  onClipsChange: (clips: TypedClip[]) => void;
}) {
  const times = timesIn(props.text);
  const clips = props.clips;
  const remove = (index: number) => props.onClipsChange(clips.filter((_, i) => i !== index));
  return (
    <div className="flex flex-col gap-2">
      {clips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {clips.map((c, i) => (
            <div
              key={`${c.path}-${i}`}
              className="relative w-48 shrink-0 overflow-hidden rounded-md bg-white ring-1 ring-slate-200"
            >
              <a href={props.imageUrl(c.path)} target="_blank" rel="noreferrer" title="Open full size">
                <img src={props.imageUrl(c.path)} alt="Picture from the video" className="block w-full" />
              </a>
              <DeleteClipButton
                onClick={async () => {
                  const ok = await askConfirm({
                    title: "Delete this picture?",
                    message: "It will be removed from your notes.",
                    confirmLabel: "Yes, delete",
                    cancelLabel: "Keep it",
                    danger: true,
                  });
                  if (ok) remove(i);
                }}
              />
            </div>
          ))}
        </div>
      )}
      {times.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          Jump to:
          {times.map((t) => (
            <button
              key={t}
              onClick={() => props.onJump(t)}
              className="rounded-full bg-red-600 px-2 py-0.5 font-mono font-semibold text-white hover:bg-red-700"
            >
              ▶ {formatTime(t)}
            </button>
          ))}
        </div>
      )}
      <textarea
        id="typed-notes"
        ref={props.boxRef}
        value={props.text}
        onChange={(e) => props.onChange(e.target.value)}
        onKeyDown={(e) => {
          // Ctrl/Cmd + Shift + S stamps the current video time while typing.
          if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "s") {
            e.preventDefault();
            props.onStamp();
          }
        }}
        placeholder={
          "Type your notes here…\n\nTip: press ⏱ Stamp time (or Ctrl+Shift+S) to add the video's current time, like [12:34]. Click a time above to jump back to it. Press 📷 Clip to add a picture of the video."
        }
        className="min-h-[65vh] w-full resize-y rounded-lg bg-white p-4 text-base leading-relaxed shadow-sm ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-slate-400"
      />
    </div>
  );
}

const AI_PRESETS = [
  { label: "📝 Summary in 100 words", prompt: "Summarize the video in 100 words." },
  {
    label: "💡 Key innovations",
    prompt: "Write a short report highlighting the key innovations in this video, with the time each one comes up.",
  },
  { label: "🪜 How to use it in 3 steps", prompt: "Explain in 3 steps how to use what this video shows." },
  { label: "• Report in bullets", prompt: "Write a report on this video in bullet points." },
];

function AskAi(props: {
  startedAt: number | null;
  error: string | null;
  onAsk: (prompt: string) => void;
  currentTime: () => number;
}) {
  const [prompt, setPrompt] = useState("");
  const [open, setOpen] = useState(true);
  const busy = props.startedAt !== null;

  function ask(text: string) {
    const clean = text.trim();
    if (!clean || busy) return;
    props.onAsk(clean);
  }

  return (
    <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-violet-200">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 text-left text-sm font-semibold">
        ✨ Ask AI about this video
        {busy && <span className="font-normal text-violet-700">Watching the video… this can take a minute</span>}
        <span className="ml-auto text-xs font-normal text-slate-500">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {AI_PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => ask(p.prompt)}
                disabled={busy}
                className="rounded-full bg-violet-50 px-3 py-1 text-xs text-violet-800 ring-1 ring-violet-200 hover:bg-violet-100 disabled:opacity-50"
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={() =>
                ask(`Take a screenshot at ${formatTime(props.currentTime())} and explain it in 2 sentences.`)
              }
              disabled={busy}
              className="rounded-full bg-violet-50 px-3 py-1 text-xs text-violet-800 ring-1 ring-violet-200 hover:bg-violet-100 disabled:opacity-50"
              title="Explain what's on screen right now, and add a screenshot of it"
            >
              📷 Explain this moment
            </button>
          </div>
          <div className="flex gap-2">
            <textarea
              value={prompt}
              rows={2}
              maxLength={2000}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask(prompt);
                }
              }}
              placeholder="Ask anything, e.g. “Take a screenshot at 1:01 and explain it in 2 sentences”"
              className="min-w-0 flex-1 resize-y rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
            <button
              onClick={() => ask(prompt)}
              disabled={busy || !prompt.trim()}
              className="self-start rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              Ask
            </button>
          </div>
          {props.startedAt !== null && <AskAiWorking startedAt={props.startedAt} />}
          {props.error && (
            <p className="rounded-md bg-red-50 px-2 py-1.5 text-sm text-red-700 ring-1 ring-red-200">⚠️ {props.error}</p>
          )}
          <p className="text-xs text-slate-500">
            Answers are added to the end of your typed notes, where you can edit them. Ask for a screenshot at a time and
            the video jumps there so 📷 Clip can add the picture.
          </p>
        </div>
      )}
    </div>
  );
}

// Counts the seconds while the AI works, so it's clear nothing is stuck.
function AskAiWorking({ startedAt }: { startedAt: number }) {
  const elapsed = useSecondsSince(startedAt);
  return (
    <p className="rounded-md bg-violet-50 px-2 py-1.5 text-sm text-violet-800 ring-1 ring-violet-200">
      <span className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-300 border-t-violet-700 align-[-2px]" />
      The AI is watching the video ({formatTime(elapsed)}). Long videos can take a few minutes. You can leave this
      page; the answer is still added to your notes.
    </p>
  );
}

function Toolbar(props: {
  mode: Mode;
  setMode: (m: Mode) => void;
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
  onClip: () => void;
  waitingForPaste: boolean;
  onCancelClip: () => void;
  clipCount: number;
  onDeleteAllClips: () => void;
  onClearTyped: (() => void) | null;
  clipBusy: boolean;
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
      <div className="flex overflow-hidden rounded-lg bg-slate-100 p-0.5">
        {(
          [
            ["write", "✍️ Handwriting"],
            ["type", "⌨️ Typing"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => props.setMode(id)}
            className={`rounded-md px-3 py-1 text-sm ${props.mode === id ? "bg-white font-semibold shadow-sm" : "text-slate-600"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {props.mode === "write" && (
        <>
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
        </>
      )}
      <button
        onClick={props.onStamp}
        className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700"
        title="Pin the video's current time onto your notes"
      >
        ⏱ Stamp time
      </button>
      <button
        onClick={props.onClip}
        disabled={props.clipBusy}
        className="rounded-lg px-3 py-1.5 text-sm font-semibold ring-1 ring-slate-300 hover:bg-slate-100 disabled:opacity-50"
        title={
          props.waitingForPaste
            ? "Take a screenshot of the video and tap Copy, then tap here to paste it"
            : "Put a screenshot of the video into your notes"
        }
      >
        {props.waitingForPaste ? "📋 Paste clip" : "📷 Clip"}
      </button>
      {props.waitingForPaste && (
        <button
          onClick={props.onCancelClip}
          className="rounded-lg px-2 py-1.5 text-sm text-slate-600 ring-1 ring-slate-300 hover:bg-slate-100"
        >
          Cancel
        </button>
      )}
      {props.mode === "type" && props.onClearTyped && (
        <button
          onClick={props.onClearTyped}
          className="rounded-lg px-3 py-1.5 text-sm text-slate-700 ring-1 ring-slate-300 hover:bg-slate-100"
          title="Remove all the text you typed for this video"
        >
          🧹 Clear typed notes
        </button>
      )}
      {props.clipCount > 0 && (
        <button
          onClick={props.onDeleteAllClips}
          className="rounded-lg px-3 py-1.5 text-sm text-red-700 ring-1 ring-slate-300 hover:bg-red-50"
          title="Delete every clip in this video's notes"
        >
          🗑 Delete all clips
        </button>
      )}
      {props.mode === "write" && (
        <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-600">
          <input
            id="finger-draws"
            type="checkbox"
            checked={props.fingerDraws}
            onChange={(e) => props.setFingerDraws(e.target.checked)}
          />
          Draw with finger
        </label>
      )}
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
