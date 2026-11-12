"use client";

import Link from "next/link";
import { Folder, Inbox } from "lucide-react";
import { Ico } from "@/components/Icon";

/** Shows where an item is filed, e.g. "AI › Agents". Clicking it opens that category. */
export default function CategoryTag({ path, onClick }: { path: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      title="Open this category"
      className="inline-flex max-w-full items-center gap-1 self-start rounded-md bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100"
    >
      <Ico icon={path === "Uncategorized" ? Inbox : Folder} tone="amber" size={12} />
      <span className="truncate">{path}</span>
    </button>
  );
}

/** The line under a page's title in its header, e.g. "Videos › AI › Agents", linking back to it in the library. */
export function CategoryCrumb({ section, path, href }: { section: string; path: string; href: string }) {
  return (
    <Link
      href={href}
      title="Open this category in your library"
      className="flex max-w-full items-center gap-1 truncate text-xs text-amber-800 hover:underline"
    >
      <Ico icon={path === "Uncategorized" ? Inbox : Folder} tone="amber" size={12} />
      <span className="truncate">
        {section} › {path}
      </span>
    </Link>
  );
}
