"use client";

import { X } from "lucide-react";

// An item's tags as #pills: yours in grey, then the AI's in purple. Clicking a tag shows
// everything with that tag; the × beside it removes it.
export default function TagPills({
  tags,
  aiTags,
  onTagClick,
  onRemove,
  onRemoveAi,
}: {
  tags: string[] | undefined;
  aiTags?: string[] | null;
  onTagClick: (tag: string) => void;
  onRemove: (tag: string) => void;
  onRemoveAi?: (tag: string) => void;
}) {
  // An AI tag you also typed yourself shows once, as yours.
  const mine = tags ?? [];
  const ai = (aiTags ?? []).filter((t) => !mine.some((m) => m.toLowerCase() === t.toLowerCase()));
  if (!mine.length && !ai.length) return null;
  const pill = (tag: string, fromAi: boolean) => (
    <span
      key={`${fromAi ? "ai" : "you"}-${tag}`}
      className={`group inline-flex items-center rounded-full text-xs ${fromAi ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-700"}`}
    >
      <button
        onClick={() => onTagClick(tag)}
        title={`Show everything tagged ${tag}${fromAi ? " (tag added by AI)" : ""}`}
        className={`rounded-l-full py-0.5 pl-2 pr-1 ${fromAi ? "hover:bg-violet-200" : "hover:bg-slate-200"}`}
      >
        #{tag}
      </button>
      <button
        onClick={() => (fromAi ? onRemoveAi?.(tag) : onRemove(tag))}
        title={`Remove the tag ${tag}`}
        aria-label={`Remove the tag ${tag}`}
        // On a mouse the × only shows when you point at the tag, so the cards stay calm.
        className={`rounded-r-full py-0.5 pl-0.5 pr-1.5 group-focus-within:opacity-100 group-hover:opacity-100 hover:text-red-600 [@media(hover:hover)]:opacity-0 ${fromAi ? "text-violet-400 hover:bg-violet-200" : "text-slate-400 hover:bg-slate-200"}`}
      >
        <X size={12} aria-hidden />
      </button>
    </span>
  );
  return (
    <div className="flex flex-wrap gap-1">
      {mine.map((t) => pill(t, false))}
      {ai.map((t) => pill(t, true))}
    </div>
  );
}
