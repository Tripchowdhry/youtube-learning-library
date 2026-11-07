"use client";

import type { CSSProperties } from "react";
import { Trash2 } from "lucide-react";
import { Ico } from "@/components/Icon";

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
