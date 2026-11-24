"use client";

import { useEffect, useState } from "react";

// Opens the search for the whole app from anywhere, optionally with something already typed.
export const openAppSearch = (query = "") => window.dispatchEvent(new CustomEvent("app-search:open", { detail: query }));

// "⌘K" on a Mac, "Ctrl K" elsewhere.
export function useShortcutLabel() {
  const [label, setLabel] = useState("Ctrl K");
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) setLabel("⌘K");
  }, []);
  return label;
}
