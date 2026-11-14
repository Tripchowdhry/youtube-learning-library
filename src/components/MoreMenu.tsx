"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, FolderInput, MoreHorizontal, type LucideIcon } from "lucide-react";
import { Ico, type Tone } from "@/components/Icon";

export type MoreItem = { label: string; onClick: () => void; icon?: LucideIcon; tone?: Tone; danger?: boolean; title?: string };

export type MoreMove = {
  value: string | null;
  options: { id: string; label: string }[];
  onMove: (id: string | null) => void;
  noneLabel?: string;
};

// A "⋯" button that opens a short menu for the less-used actions, so cards and toolbars stay tidy.
// With `move`, it also has "Move to category…", which swaps the menu for the list of categories.
// Delete-style items (danger) go last, under a line, so they aren't pressed by mistake.
export default function MoreMenu({
  items,
  move,
  size = "sm",
  label = "More actions",
}: {
  items: MoreItem[];
  move?: MoreMove;
  size?: "sm" | "md";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (ref.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };
  const row = "flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-100";
  const plain = items.filter((i) => !i.danger);
  const danger = items.filter((i) => i.danger);

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => {
          setPicking(false);
          setOpen((o) => !o);
        }}
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex items-center justify-center text-slate-600 ring-1 ring-slate-300 hover:bg-slate-100 ${size === "md" ? "h-8 w-9 rounded-lg" : "h-[26px] w-8 rounded-md"} ${open ? "bg-slate-100" : "bg-white"}`}
      >
        <MoreHorizontal size={size === "md" ? 18 : 16} aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 z-40 mt-1 max-h-80 w-52 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg"
        >
          {picking && move ? (
            <>
              <button type="button" onClick={() => setPicking(false)} className={`${row} text-slate-500`}>
                <ArrowLeft size={15} aria-hidden />
                Move to…
              </button>
              <div className="my-1 h-px bg-slate-200" />
              {[{ id: "", label: move.noneLabel ?? "Uncategorized" }, ...move.options].map((o) => {
                const current = (move.value ?? "") === o.id;
                return (
                  <button
                    key={o.id || "none"}
                    type="button"
                    role="menuitem"
                    onClick={() => run(() => !current && move.onMove(o.id || null))}
                    className={`${row} ${current ? "font-semibold text-slate-900" : "text-slate-800"}`}
                  >
                    <span className="w-4 shrink-0">{current && <Check size={15} aria-hidden />}</span>
                    <span className="truncate">{o.label}</span>
                  </button>
                );
              })}
            </>
          ) : (
            <>
              {plain.map((item) => (
                <button key={item.label} type="button" role="menuitem" title={item.title} onClick={() => run(item.onClick)} className={`${row} text-slate-800`}>
                  {item.icon && <Ico icon={item.icon} tone={item.tone ?? "slate"} size={15} />}
                  {item.label}
                </button>
              ))}
              {move && (
                <button type="button" role="menuitem" onClick={() => setPicking(true)} className={`${row} text-slate-800`}>
                  <Ico icon={FolderInput} tone="amber" size={15} />
                  Move to category…
                </button>
              )}
              {danger.length > 0 && (plain.length > 0 || move) && <div className="my-1 h-px bg-slate-200" />}
              {danger.map((item) => (
                <button key={item.label} type="button" role="menuitem" title={item.title} onClick={() => run(item.onClick)} className={`${row} text-red-600`}>
                  {item.icon && <Ico icon={item.icon} tone="red" size={15} />}
                  {item.label}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </span>
  );
}
