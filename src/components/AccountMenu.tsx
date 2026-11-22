"use client";

import { ChartColumn, ChevronDown, LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Ico } from "@/components/Icon";

// The account menu at the right of the header: your email opens a small menu with the AI usage
// page and Sign out. Phones have no room for it; there both links sit in the Categories menu.
export default function AccountMenu({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const item = "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100";
  return (
    <div ref={box} className="relative hidden shrink-0 sm:block">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Your account"
        className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
      >
        <UserRound size={16} className="shrink-0 lg:hidden" aria-hidden />
        <span className="hidden max-w-40 truncate lg:inline">{email}</span>
        <ChevronDown size={14} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-1 w-56 overflow-hidden rounded-lg bg-white py-1 shadow-lg ring-1 ring-slate-200">
          <p className="truncate border-b border-slate-100 px-3 pt-1 pb-2 text-xs text-slate-400 lg:hidden">{email}</p>
          <Link href="/ai-usage" role="menuitem" className={item} onClick={() => setOpen(false)}>
            <Ico icon={ChartColumn} tone="blue" />
            AI usage
          </Link>
          <button role="menuitem" className={item} onClick={onSignOut}>
            <LogOut size={16} className="shrink-0 text-slate-400" aria-hidden />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
