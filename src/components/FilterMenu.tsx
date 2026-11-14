"use client";

import { useEffect, useRef, useState } from "react";
import { ListFilter } from "lucide-react";

export type FilterGroup = {
  label: string;
  value: string;
  // The first option is the "no filter" one (Any time, All).
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
};

// One "Filter" button in place of rows of filter pills. It turns dark and shows how many
// filters are on, so an active filter is never hidden.
export default function FilterMenu({ groups, tour }: { groups: FilterGroup[]; tour?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const active = groups.filter((g) => g.value !== g.options[0]?.value).length;

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

  return (
    <span ref={ref} data-tour={tour} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={active ? `${active} filter${active > 1 ? "s" : ""} on` : "Filter the list"}
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm ${active ? "border-slate-900 bg-slate-900 text-white hover:bg-slate-700" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"}`}
      >
        <ListFilter size={15} aria-hidden />
        Filter
        {active > 0 && (
          <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold text-slate-900">
            {active}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Filter" className="absolute top-full right-0 z-40 mt-1.5 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          {groups.map((g) => (
            <div key={g.label} className="mb-2.5">
              <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{g.label}</p>
              <div className="flex flex-wrap gap-1">
                {g.options.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => g.onChange(o.value)}
                    className={`rounded-full border px-2.5 py-0.5 text-xs whitespace-nowrap ${g.value === o.value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700 hover:bg-slate-100"}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-slate-200 pt-2">
            <button
              type="button"
              onClick={() => groups.forEach((g) => g.onChange(g.options[0].value))}
              disabled={!active}
              className="text-sm text-slate-500 underline hover:text-slate-800 disabled:no-underline disabled:opacity-40"
            >
              Clear filters
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-slate-900 px-3 py-1 text-sm font-semibold text-white hover:bg-slate-700">
              Done
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
