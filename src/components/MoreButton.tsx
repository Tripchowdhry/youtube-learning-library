"use client";

import { MoreHorizontal } from "lucide-react";

// The small "⋯" at the end of a sidebar category: opens the same menu as right-clicking it,
// so Rename, Share and Delete are reachable on phones too. On laptops it shows on hover.
export default function MoreButton({ label, active, onClick }: { label: string; active: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      type="button"
      aria-label={`More for ${label}`}
      title="Rename, share, delete…"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      className={`mr-1 shrink-0 rounded p-1 focus:opacity-100 md:opacity-0 md:group-hover:opacity-100 ${
        active ? "text-slate-300 hover:bg-slate-700 hover:text-white md:opacity-100" : "text-slate-400 hover:bg-slate-200 hover:text-slate-700"
      }`}
    >
      <MoreHorizontal size={16} aria-hidden />
    </button>
  );
}
