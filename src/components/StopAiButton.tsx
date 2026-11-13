"use client";

import { Square } from "lucide-react";
import { stopAiJob } from "@/lib/ai-jobs";

// Cancels an AI request that is still working. Nothing is added and no error shows.
export default function StopAiButton({ jobKey, className = "" }: { jobKey: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => stopAiJob(jobKey)}
      title="Stop the AI. Nothing is added, and you can ask again."
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border border-violet-300 bg-white px-2 py-0.5 text-xs font-semibold text-violet-800 hover:bg-violet-100 ${className}`}
    >
      <Square size={10} fill="currentColor" aria-hidden />
      Stop
    </button>
  );
}
