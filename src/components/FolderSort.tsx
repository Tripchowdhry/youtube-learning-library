"use client";

import { useEffect, useState } from "react";

// How folders and categories are listed. "custom" is the order you set by dragging.
export type FolderSort = "custom" | "name" | "newest" | "oldest";

const SORT_KEY = "folder-sort";

const OPTIONS: { value: FolderSort; label: string }[] = [
  { value: "custom", label: "My order" },
  { value: "name", label: "Name (A–Z)" },
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
];

type Sortable = { name: string; position: number; created_at: string };

export function compareFolders(sort: FolderSort) {
  return (a: Sortable, b: Sortable) => {
    const byName = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    if (sort === "name") return byName;
    if (sort === "newest") return b.created_at.localeCompare(a.created_at) || byName;
    if (sort === "oldest") return a.created_at.localeCompare(b.created_at) || byName;
    return a.position - b.position || byName;
  };
}

// One choice for the whole app, remembered on this device.
export function useFolderSort() {
  const [sort, setSort] = useState<FolderSort>("custom");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SORT_KEY);
      if (OPTIONS.some((o) => o.value === stored)) setSort(stored as FolderSort);
    } catch {
      // Storage can be blocked (private browsing); keep your own order.
    }
  }, []);

  function chooseSort(next: FolderSort) {
    setSort(next);
    try {
      localStorage.setItem(SORT_KEY, next);
    } catch {
      // Storage can be blocked (private browsing); the choice just isn't remembered.
    }
  }

  return [sort, chooseSort] as const;
}

export function FolderSortSelect({ sort, onChange }: { sort: FolderSort; onChange: (next: FolderSort) => void }) {
  return (
    <select
      value={sort}
      onChange={(e) => onChange(e.target.value as FolderSort)}
      className="ml-auto rounded border-0 bg-transparent py-0 pr-1 text-xs font-normal tracking-normal text-slate-500 normal-case hover:bg-slate-100"
      aria-label="Sort by"
      title="Sort by"
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// The hint under the list: dragging only makes sense in your own order.
export function sortHint(sort: FolderSort, things: string) {
  return sort === "custom"
    ? `Drag ${things} to reorder. Right-click one to rename.`
    : `Pick "My order" to drag ${things} into place. Right-click one to rename.`;
}
