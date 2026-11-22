"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

// "← Back" for pages you can open from any tab, such as AI usage: it returns to the page you came
// from, or to `fallback` when the page was opened directly (a bookmark or a new tab).
export default function BackLink({ fallback = "/" }: { fallback?: string }) {
  const router = useRouter();
  return (
    <Link
      href={fallback}
      onClick={(e) => {
        const cameFromHere = document.referrer.startsWith(window.location.origin);
        if (cameFromHere && window.history.length > 1) {
          e.preventDefault();
          router.back();
        }
      }}
      className="shrink-0 rounded-md px-2 py-1 text-sm hover:bg-slate-100"
    >
      ← Back
    </Link>
  );
}
