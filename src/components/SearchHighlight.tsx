"use client";

import { X } from "lucide-react";
import { highlightRanges, resultCount, type SearchMatch, type SearchWord } from "@/lib/search";

// Text with the searched words marked in yellow. With no search it's just the text.
export function Highlight({ text, words }: { text: string | null | undefined; words: SearchWord[] }) {
  if (!text) return null;
  if (!words.length) return <>{text}</>;
  const ranges = highlightRanges(text, words);
  if (!ranges.length) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let at = 0;
  ranges.forEach(([start, end], i) => {
    if (start > at) parts.push(text.slice(at, start));
    parts.push(
      <mark key={i} className="rounded-sm bg-yellow-200 text-inherit">
        {text.slice(start, end)}
      </mark>,
    );
    at = end;
  });
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

// "Found in your notes: …the words around it…", under a search result whose title doesn't
// show why it matched.
export function FoundIn({ match, words }: { match: SearchMatch; words: SearchWord[] }) {
  if (!match) return null;
  return (
    <p className="rounded-md bg-yellow-50 px-2 py-1 text-xs text-slate-700 ring-1 ring-yellow-200">
      {/* The clamp sits inside the padding, so no half-cut line peeks out below. */}
      <span className="line-clamp-4 sm:line-clamp-3">
        <span className="font-semibold text-slate-900">Found in {match.label}: </span>
        <Highlight text={match.snippet} words={words} />
      </span>
    </p>
  );
}

export type SearchScope = "here" | "everywhere";

// Shown above search results: how many there are, the tag being filtered by (with × to drop it),
// and, inside a category, whether to look only there or in the whole tab.
export function SearchBar(props: {
  count: number;
  /** False for a tag on its own: then the list keeps the newest first. */
  ranked?: boolean;
  tag: string | null;
  onClearTag: () => void;
  /** The category open on the left, or null in All / Uncategorized, where there's nothing to switch. */
  categoryName: string | null;
  scope: SearchScope;
  onScope: (scope: SearchScope) => void;
}) {
  const option = (value: SearchScope, label: string) => (
    <button
      type="button"
      onClick={() => props.onScope(value)}
      aria-pressed={props.scope === value}
      className={`max-w-48 truncate rounded px-2 py-0.5 ${props.scope === value ? "bg-white font-semibold text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
    >
      {label}
    </button>
  );
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium text-slate-700">
        {resultCount(props.count)}
        {props.count > 1 && props.ranked !== false && <span className="font-normal text-slate-500">, best matches first</span>}
      </span>
      {props.tag && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 py-0.5 pr-1 pl-2.5 text-xs font-medium text-amber-900 ring-1 ring-amber-300">
          Tag #{props.tag}
          <button
            type="button"
            onClick={props.onClearTag}
            title="Stop filtering by this tag"
            aria-label={`Stop filtering by #${props.tag}`}
            className="rounded-full p-0.5 hover:bg-amber-200"
          >
            <X size={12} aria-hidden />
          </button>
        </span>
      )}
      {props.categoryName && (
        <span className="inline-flex items-center gap-0.5 rounded-md bg-slate-100 p-0.5 text-xs">
          <span className="px-1.5 text-slate-500">Look in</span>
          {option("here", props.categoryName)}
          {option("everywhere", "Everywhere")}
        </span>
      )}
    </div>
  );
}
