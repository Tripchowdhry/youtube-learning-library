"use client";

import { Clock, Search, X } from "lucide-react";
import { openAppSearch, useShortcutLabel } from "@/lib/app-search";
import { useEffect, useRef, useState } from "react";

const RECENT_MAX = 5;

// The last few searches in a tab, kept on this device only.
export function readRecent(key: string): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(list) ? list.filter((s) => typeof s === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function writeRecent(key: string, list: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Private windows can refuse; recent searches are only a convenience.
  }
}

// A search box with a clear (×) button that shows once something is typed. Escape clears it too.
// With `collapse`, phones show just a search button; tapping it opens a full-width box over the
// header (the nearest positioned parent), with Cancel to close it. Larger screens are unchanged.
// With `collapse`, pressing / anywhere on the page (outside a text box) jumps to the search.
// With `recentKey`, the last few searches show under the empty box, to run again with one tap.
export default function SearchBox({
  value,
  onChange,
  placeholder,
  className,
  tour,
  collapse,
  recentKey,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
  tour?: string;
  collapse?: boolean;
  recentKey?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const phoneInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const storageKey = recentKey ? `recent-searches:${recentKey}` : null;
  const shortcut = useShortcutLabel();

  useEffect(() => {
    if (storageKey) setRecent(readRecent(storageKey));
  }, [storageKey]);

  // A search worth remembering: kept when you press Enter or leave the box.
  function remember(text: string) {
    const q = text.trim();
    if (!storageKey || q.length < 2) return;
    const next = [q, ...recent.filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(0, RECENT_MAX);
    setRecent(next);
    writeRecent(storageKey, next);
  }

  function forget() {
    if (!storageKey) return;
    setRecent([]);
    writeRecent(storageKey, []);
  }

  // Press / to search, unless you're already typing somewhere.
  useEffect(() => {
    if (!collapse) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      // The laptop box is hidden on phones; open the phone box there instead.
      if (input.current?.offsetParent) input.current.focus();
      else setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [collapse]);

  const clear = () => {
    onChange("");
    input.current?.focus();
  };
  const field = (ref: typeof input, extra = "", autoFocus = false) => (
    <input
      ref={ref}
      autoFocus={autoFocus}
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        remember(value);
      }}
      onKeyDown={(e) => {
        // Escape clears the search; on an empty box it closes the list under it (and the phone search).
        if (e.key === "Escape" && value) {
          e.preventDefault();
          onChange("");
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.currentTarget.blur();
          setOpen(false);
        }
        if (e.key === "Enter") remember(value);
      }}
      placeholder={placeholder}
      title={collapse ? "Search (press / to jump here)" : undefined}
      className={`w-full rounded-md border border-slate-300 py-1.5 pr-8 text-sm [&::-webkit-search-cancel-button]:appearance-none ${extra || "pl-3"}`}
    />
  );
  const clearButton = value && (
    <button
      type="button"
      onClick={clear}
      title="Clear search"
      aria-label="Clear search"
      className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
    >
      <X size={14} aria-hidden />
    </button>
  );
  // Under the empty box while it has the focus: recent searches, and (in a tab's main search)
  // the way to search every tab at once.
  const recentList = focused && !value && (recent.length > 0 || collapse) && (
    <div className="absolute top-full right-0 left-0 z-40 mt-1 rounded-md bg-white py-1 text-sm shadow-lg ring-1 ring-slate-200 sm:left-auto sm:w-full sm:min-w-60">
      {recent.length > 0 && (
        <>
          <div className="flex items-center justify-between px-3 pt-0.5 pb-1 text-xs text-slate-500">
            <span>Recent searches</span>
            <button
              type="button"
              // Keep the focus in the box, so the list doesn't close before the click lands.
              onMouseDown={(e) => e.preventDefault()}
              onClick={forget}
              className="rounded px-1 hover:bg-slate-100 hover:text-slate-800"
            >
              Clear
            </button>
          </div>
          {recent.map((r) => (
            <button
              key={r}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onChange(r)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-700 hover:bg-slate-100"
            >
              <Clock size={14} aria-hidden className="shrink-0 text-slate-400" />
              <span className="truncate">{r}</span>
            </button>
          ))}
        </>
      )}
      {collapse && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setOpen(false);
            openAppSearch();
          }}
          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-700 hover:bg-slate-100 ${recent.length ? "mt-1 border-t border-slate-100 pt-2" : ""}`}
        >
          <Search size={14} aria-hidden className="shrink-0 text-slate-400" />
          <span className="flex-1 whitespace-nowrap">Search all tabs</span>
          <kbd className="hidden rounded border border-slate-200 px-1.5 font-sans text-[11px] whitespace-nowrap text-slate-400 sm:block">{shortcut}</kbd>
        </button>
      )}
    </div>
  );

  if (!collapse) {
    return (
      <div data-tour={tour} className={`relative ${className ?? ""}`}>
        {field(input)}
        {clearButton}
        {recentList}
      </div>
    );
  }

  // Stays open while there's a search, so the results never hide what they were filtered by.
  const phoneOpen = open || !!value;
  const close = () => {
    onChange("");
    setOpen(false);
  };
  return (
    <div data-tour={tour} className={`sm:relative ${className ?? ""}`}>
      <div className="relative hidden sm:block">
        {field(input)}
        {clearButton}
        {recentList}
      </div>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
        title="Search"
        aria-label="Search"
        className="rounded-md border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-100 sm:hidden"
      >
        <Search size={18} aria-hidden />
      </button>
      {phoneOpen && (
        <div className="absolute inset-0 z-30 flex items-center gap-2 bg-white px-4 sm:hidden">
          <div className="relative flex-1">
            <Search size={16} aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400" />
            {field(phoneInput, "pl-8", open)}
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  phoneInput.current?.focus();
                }}
                title="Clear search"
                aria-label="Clear search"
                className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={14} aria-hidden />
              </button>
            )}
            {recentList}
          </div>
          <button type="button" onClick={close} className="shrink-0 rounded-md px-1 py-1 text-sm text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
