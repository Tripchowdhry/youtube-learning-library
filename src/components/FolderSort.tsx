"use client";

import { useEffect, useState } from "react";

// How folders and categories are listed. "custom" is the order you set by dragging.
export type FolderSort = "custom" | "name" | "newest" | "oldest";

const SORT_KEY = "folder-sort";
const ITEM_SORT_KEY = "item-sort";

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

// How the videos, links or pages inside a folder are listed. "custom" is your ▲▼ order
// inside a folder, and newest first everywhere else.
export function compareItems<T extends { position: number; created_at: string }>(
  sort: FolderSort,
  name: (item: T) => string,
  inFolder: boolean,
) {
  return (a: T, b: T) => {
    const byName = name(a).localeCompare(name(b), undefined, { numeric: true, sensitivity: "base" });
    const newest = b.created_at.localeCompare(a.created_at);
    if (sort === "name") return byName || newest;
    if (sort === "oldest") return -newest || byName;
    if (sort === "custom" && inFolder) return a.position - b.position || newest;
    return newest || byName;
  };
}

// One choice for the whole app, remembered on this device.
export function useItemSort() {
  return useFolderSort(ITEM_SORT_KEY);
}

// One choice for the whole app, remembered on this device.
export function useFolderSort(key = SORT_KEY) {
  const [sort, setSort] = useState<FolderSort>("custom");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (OPTIONS.some((o) => o.value === stored)) setSort(stored as FolderSort);
    } catch {
      // Storage can be blocked (private browsing); keep your own order.
    }
  }, [key]);

  function chooseSort(next: FolderSort) {
    setSort(next);
    try {
      localStorage.setItem(key, next);
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

// The sort menu above a list of videos, links or pages.
export function ItemSortSelect({ sort, onChange }: { sort: FolderSort; onChange: (next: FolderSort) => void }) {
  return (
    <label className="flex items-center gap-1 text-xs text-slate-500">
      Sort
      <select
        value={sort}
        onChange={(e) => onChange(e.target.value as FolderSort)}
        className="rounded-md border border-slate-300 bg-white px-1 py-1 text-xs text-slate-700"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// The hint under the list: dragging only makes sense in your own order.
export function sortHint(sort: FolderSort, things: string) {
  return sort === "custom"
    ? `Drag ${things} to reorder. Right-click one to rename.`
    : `Pick "My order" to drag ${things} into place. Right-click one to rename.`;
}
