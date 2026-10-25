"use client";

import type { CSSProperties } from "react";
import { formatTime } from "@/lib/youtube-player";

// The red time badge on a clip: tap the time to jump there, or ✕ to remove the badge.
export function ClipTime(props: {
  seconds: number;
  onJump: () => void;
  onHide: () => void;
  style?: CSSProperties;
}) {
  return (
    <span
      className="absolute top-0 left-0 flex overflow-hidden rounded-br-md bg-red-600 font-mono text-[11px] font-semibold text-white"
      style={props.style}
    >
      <button
        onClick={props.onJump}
        className="px-1.5 py-0.5 hover:bg-red-700"
        title="Jump the video to this moment"
      >
        ▶ {formatTime(props.seconds)}
      </button>
      <button
        onClick={props.onHide}
        className="border-l border-red-400 px-2 hover:bg-red-700"
        title="Remove the time from this clip"
      >
        ✕
      </button>
    </span>
  );
}

export function DeleteClipButton(props: {
  onClick: () => void;
  style?: CSSProperties;
}) {
  return (
    <button
      onClick={props.onClick}
      className="absolute top-1 right-1 rounded-md bg-white/90 px-2 py-0.5 text-xs font-medium text-red-700 shadow ring-1 ring-slate-300 hover:bg-red-50"
      style={props.style}
      title="Delete this clip"
    >
      🗑 Delete
    </button>
  );
}
