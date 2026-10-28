"use client";

import { useEffect, useState } from "react";
import { type AiJob, useAiJobs, useSecondsSince } from "@/lib/ai-jobs";
import { formatTime } from "@/lib/youtube-player";

// A small reminder in the corner of every page that the AI is still working, and a
// note when something it was asked for has been saved.
export default function AiJobsBadge() {
  const { running, finished } = useAiJobs();
  const [shownFinish, setShownFinish] = useState<number | null>(null);

  useEffect(() => {
    if (!finished) return;
    setShownFinish(finished.at);
    const timer = setTimeout(() => setShownFinish(null), 6000);
    return () => clearTimeout(timer);
  }, [finished]);

  if (!running.length && !(finished && shownFinish === finished.at)) return null;
  return (
    <div className="pointer-events-none fixed bottom-3 left-3 z-50 flex max-w-[calc(100vw-1.5rem)] flex-col gap-1.5">
      {running.length > 0 && <Working job={running[0]} more={running.length - 1} />}
      {finished && shownFinish === finished.at && (
        <p className="truncate rounded-full bg-green-50 px-3 py-1.5 text-xs text-green-800 shadow ring-1 ring-green-200">
          ✅ {finished.label} is saved
        </p>
      )}
    </div>
  );
}

function Working({ job, more }: { job: AiJob; more: number }) {
  const seconds = useSecondsSince(job.startedAt);
  return (
    <p className="flex items-center gap-1.5 truncate rounded-full bg-violet-50 px-3 py-1.5 text-xs text-violet-800 shadow ring-1 ring-violet-200">
      <span className="inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-violet-300 border-t-violet-700" />
      <span className="truncate">
        Working on {job.label}
        {more > 0 ? ` and ${more} more` : ""}… {formatTime(seconds)}
      </span>
    </p>
  );
}
