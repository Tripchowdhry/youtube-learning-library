"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Ico } from "@/components/Icon";
import { aiTagsOn, findUntagged, setAiTagsOn, tagWithAi, type Untagged } from "@/lib/ai-tags";
import { createClient } from "@/lib/supabase/client";

// A pause between items when tagging older ones, so a big library stays inside the free plan's
// requests per minute.
const GAP_MS = 4_000;

// Turns AI tags on or off (kept with the account, so it's the same on every device), and tags
// what was saved before AI tags existed.
export default function AiTagsSwitch() {
  const supabase = useMemo(() => createClient(), []);
  const [on, setOn] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const [untagged, setUntagged] = useState<Untagged[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; tagged: number } | null>(null);
  const [runNote, setRunNote] = useState<string | null>(null);
  const stop = useRef(false);

  useEffect(() => {
    aiTagsOn(supabase).then(setOn);
    findUntagged(supabase).then(setUntagged);
    return () => {
      // Leaving the page stops the run; what's left stays untagged for next time.
      stop.current = true;
    };
  }, [supabase]);

  async function toggle() {
    if (on === null) return;
    const next = !on;
    setOn(next);
    setFailed(false);
    if (!(await setAiTagsOn(supabase, next))) {
      setOn(!next);
      setFailed(true);
    }
  }

  async function tagAll() {
    if (!untagged?.length) return;
    stop.current = false;
    const list = untagged;
    let tagged = 0;
    let failedInARow = 0;
    setRunNote(null);
    setProgress({ done: 0, total: list.length, tagged });
    for (let i = 0; i < list.length && !stop.current; i++) {
      const item = list[i];
      if ((await tagWithAi(supabase, item.kind, item.id, item)) !== null) {
        tagged++;
        failedInARow = 0;
      } else if (++failedInARow === 3) {
        // The AI is busy, out of free uses for now, or not set up: stop rather than keep trying.
        setRunNote("The AI isn't answering right now, so tagging stopped. Try again later; it picks up where it left off.");
        break;
      }
      setProgress({ done: i + 1, total: list.length, tagged });
      if (i < list.length - 1 && !stop.current) await new Promise((r) => setTimeout(r, GAP_MS));
    }
    setProgress(null);
    setUntagged(await findUntagged(supabase));
  }

  const running = progress !== null;
  return (
    <section className="flex flex-col gap-2 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center gap-3">
        <Ico icon={Sparkles} tone="violet" size={20} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Add topic tags automatically</p>
          <p className="text-xs text-slate-500">
            When you save something, the AI adds up to 3 topic tags in <span className="rounded-full bg-violet-100 px-1.5 text-violet-800">purple</span>,
            so you can find related items by clicking a tag or typing #tag in search. You can add 2 of your own.
          </p>
          {failed && <p className="text-xs text-red-700">Couldn&apos;t save that. Try again.</p>}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on === true}
          aria-label="Add topic tags automatically"
          disabled={on === null}
          onClick={toggle}
          className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-violet-600" : "bg-slate-300"} disabled:opacity-50`}
        >
          <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on ? "translate-x-5" : ""}`} />
        </button>
      </div>
      {/* Only while AI tags are on and there's something older to tag. */}
      {on && (running || (untagged?.length ?? 0) > 0) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2 pl-8 text-xs text-slate-600">
          {running ? (
            <>
              <span className="tabular-nums">
                Tagging {progress.done} of {progress.total}…
              </span>
              <span className="h-1.5 min-w-24 flex-1 overflow-hidden rounded-full bg-violet-100">
                <span className="block h-full bg-violet-500 transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </span>
              <button
                type="button"
                onClick={() => (stop.current = true)}
                className="rounded-md px-2 py-1 font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
              >
                Stop
              </button>
            </>
          ) : (
            <>
              <span>
                {untagged!.length} item{untagged!.length === 1 ? "" : "s"} saved before this was on {untagged!.length === 1 ? "has" : "have"} no topic tags.
              </span>
              <button
                type="button"
                onClick={tagAll}
                className="rounded-md px-2 py-1 font-medium text-violet-700 ring-1 ring-violet-200 hover:bg-violet-50"
              >
                Tag {untagged!.length === 1 ? "it" : "them"} too
              </button>
              <span className="text-slate-400">Keep this page open; about {Math.max(1, Math.ceil((untagged!.length * GAP_MS) / 60_000))} min.</span>
            </>
          )}
        </div>
      )}
      {runNote && <p className="pl-8 text-xs text-amber-800">{runNote}</p>}
    </section>
  );
}
