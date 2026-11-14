"use client";

import { X } from "lucide-react";
import { useRef } from "react";

// A search box with a clear (×) button that shows once something is typed. Escape clears it too.
export default function SearchBox({
  value,
  onChange,
  placeholder,
  className,
  tour,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
  tour?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const clear = () => {
    onChange("");
    input.current?.focus();
  };
  return (
    <div className={`relative ${className ?? ""}`}>
      <input
        ref={input}
        data-tour={tour}
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
        className="w-full rounded-md border border-slate-300 py-1.5 pr-8 pl-3 text-sm [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value && (
        <button
          type="button"
          onClick={clear}
          title="Clear search"
          aria-label="Clear search"
          className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X size={14} aria-hidden />
        </button>
      )}
    </div>
  );
}
