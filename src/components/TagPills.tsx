"use client";

import { X } from "lucide-react";

// An item's tags as #pills. Clicking a tag shows everything with that tag; the × beside it removes it.
export default function TagPills({
  tags,
  onTagClick,
  onRemove,
}: {
  tags: string[] | undefined;
  onTagClick: (tag: string) => void;
  onRemove: (tag: string) => void;
}) {
  if (!tags?.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span key={tag} className="inline-flex items-center rounded-full bg-slate-100 text-xs text-slate-700">
          <button
            onClick={() => onTagClick(tag)}
            title={`Show everything tagged ${tag}`}
            className="rounded-l-full py-0.5 pl-2 pr-1 hover:bg-slate-200"
          >
            #{tag}
          </button>
          <button
            onClick={() => onRemove(tag)}
            title={`Remove the tag ${tag}`}
            aria-label={`Remove the tag ${tag}`}
            className="rounded-r-full py-0.5 pl-0.5 pr-1.5 text-slate-400 hover:bg-slate-200 hover:text-red-600"
          >
            <X size={12} aria-hidden />
          </button>
        </span>
      ))}
    </div>
  );
}
