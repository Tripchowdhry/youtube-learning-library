"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ClipboardPaste, Trash2 } from "lucide-react";
import ClipsIcon from "@/components/ClipsIcon";
import { Ico } from "@/components/Icon";
import { compressImage, uploadClip, type ClipImage } from "@/lib/clips";
import { createClient } from "@/lib/supabase/client";

export function DeleteClipButton(props: { onClick: () => void; style?: CSSProperties }) {
  return (
    <button
      onClick={props.onClick}
      className="absolute top-1 right-1 inline-flex items-center gap-1 rounded-md bg-white/90 px-2 py-0.5 text-xs font-medium text-red-700 shadow ring-1 ring-slate-300 hover:bg-red-50"
      style={props.style}
      title="Delete this picture"
    >
      <Ico icon={Trash2} tone="red" size={13} />
      Delete
    </button>
  );
}

// ---------- The Clip button for Reading and ScrapBook ----------

// The same Mac shortcut (in Apple's Shortcuts app) the video notes use to start a screenshot.
const MAC_SHORTCUT = "Clip Video";

/**
 * Puts a screenshot into the notes, the same way Clip works on a video.
 * Mac: runs the "Clip Video" shortcut, then Cmd+V pastes. Windows: opens the Snipping Tool, then Ctrl+V.
 * iPad and others: take a screenshot and copy it, then tap "Paste clip" (or pick a picture).
 * Pasting a picture anywhere on the page also adds it.
 */
export function ClipButton({
  onPicture,
  what,
  compact = false,
}: {
  onPicture: (image: ClipImage, path: string) => void;
  what: string;
  compact?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [screenshotLink, setScreenshotLink] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints === 0) {
      setScreenshotLink(`shortcuts://run-shortcut?name=${encodeURIComponent(MAC_SHORTCUT)}`);
    } else if (/Windows/.test(navigator.userAgent)) {
      setScreenshotLink("ms-screenclip:");
    }
  }, []);

  const flash = useCallback((text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(null), 4000);
  }, []);

  const add = useCallback(
    async (source: Blob) => {
      setBusy(true);
      try {
        const image = await compressImage(source);
        const path = await uploadClip(supabase, image);
        onPicture(image, path);
        setWaiting(false);
      } catch (error) {
        flash(`Couldn't save the picture: ${error instanceof Error ? error.message : "unknown error"}`);
      } finally {
        setBusy(false);
      }
    },
    [supabase, onPicture, flash],
  );

  // Pasting a picture anywhere on the page (Ctrl+V / Cmd+V / long-press Paste) adds it as a clip.
  const addRef = useRef(add);
  addRef.current = add;
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (!file) return;
      e.preventDefault();
      addRef.current(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  function start() {
    if (screenshotLink) window.location.href = screenshotLink;
    else setWaiting(true);
  }

  // The second tap on iPad. If the clipboard can't be read, pick a picture instead.
  async function paste() {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (type) return await add(await item.getType(type));
      }
      flash(`No picture copied yet. Take a screenshot of the ${what} and copy it first.`);
    } catch {
      fileInput.current?.click();
    }
  }

  return (
    <>
      <button
        onClick={waiting ? paste : start}
        // Keep the typing spot in the text, so the picture lands where you were typing.
        onMouseDown={(e) => e.preventDefault()}
        disabled={busy}
        className={`flex items-center gap-1 ring-1 ring-slate-300 hover:bg-slate-100 disabled:opacity-50 ${
          compact ? "rounded-md bg-white px-2 py-1 text-xs text-slate-700" : "rounded-lg px-3 py-1.5 text-sm font-semibold"
        }`}
        title={
          waiting
            ? `Take a screenshot of the ${what} and tap Copy, then tap here to paste it`
            : `Put a screenshot of the ${what} into your notes`
        }
      >
        {waiting ? <Ico icon={ClipboardPaste} tone="amber" size={compact ? 14 : 16} /> : <ClipsIcon size={compact ? 16 : 18} />}
        {waiting ? "Paste clip" : "Clip"}
      </button>
      {waiting && (
        <button
          onClick={() => setWaiting(false)}
          className={`text-slate-600 ring-1 ring-slate-300 hover:bg-slate-100 ${compact ? "rounded-md px-2 py-1 text-xs" : "rounded-lg px-2 py-1.5 text-sm"}`}
        >
          Cancel
        </button>
      )}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) add(file);
        }}
      />
      {(notice || busy) && (
        <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
          {busy ? "Saving picture…" : notice}
        </div>
      )}
    </>
  );
}
