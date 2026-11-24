"use client";

import { highlightRanges, type SearchMatch, type SearchWord } from "@/lib/search";

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
    <p className="line-clamp-3 rounded-md bg-yellow-50 px-2 py-1 text-xs text-slate-700 ring-1 ring-yellow-200">
      <span className="font-semibold text-slate-900">Found in {match.label}: </span>
      <Highlight text={match.snippet} words={words} />
    </p>
  );
}
