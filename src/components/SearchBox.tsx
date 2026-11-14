"use client";

import { Search, X } from "lucide-react";
import { useRef, useState } from "react";

// A search box with a clear (×) button that shows once something is typed. Escape clears it too.
// With `collapse`, phones show just a search button; tapping it opens a full-width box over the
// header (the nearest positioned parent), with Cancel to close it. Larger screens are unchanged.
export default function SearchBox({
  value,
  onChange,
  placeholder,
  className,
  tour,
  collapse,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
  tour?: string;
  collapse?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const phoneInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
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
      onKeyDown={(e) => {
        if (e.key === "Escape" && value) {
          e.preventDefault();
          onChange("");
        }
      }}
      placeholder={placeholder}
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

  if (!collapse) {
    return (
      <div data-tour={tour} className={`relative ${className ?? ""}`}>
        {field(input)}
        {clearButton}
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
          </div>
          <button type="button" onClick={close} className="shrink-0 rounded-md px-1 py-1 text-sm text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
