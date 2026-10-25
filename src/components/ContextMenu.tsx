"use client";

import { useEffect, useRef } from "react";

export type MenuItem = { label: string; onClick: () => void; danger?: boolean };
export type MenuState = { x: number; y: number; items: MenuItem[] };

// A small right-click menu. It closes on a click elsewhere, Escape, or scrolling.
export default function ContextMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: Event) => {
      if (e instanceof MouseEvent && ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", close);
    document.addEventListener("scroll", close, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("scroll", close, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Keep the menu on screen near the right and bottom edges.
  const left = Math.min(menu.x, window.innerWidth - 190);
  const top = Math.min(menu.y, window.innerHeight - menu.items.length * 36 - 12);

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-40 w-44 rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg"
      style={{ left, top }}
    >
      {menu.items.map((item) => (
        <button
          key={item.label}
          role="menuitem"
          onClick={() => {
            onClose();
            item.onClick();
          }}
          className={`block w-full px-3 py-1.5 text-left hover:bg-slate-100 ${item.danger ? "text-red-600" : "text-slate-800"}`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
