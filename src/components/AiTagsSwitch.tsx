"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Ico } from "@/components/Icon";
import { aiTagsOn, setAiTagsOn } from "@/lib/ai-tags";
import { createClient } from "@/lib/supabase/client";

// Turns AI tags on or off. Kept with the account, so it's the same on every device.
export default function AiTagsSwitch() {
  const supabase = useMemo(() => createClient(), []);
  const [on, setOn] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    aiTagsOn(supabase).then(setOn);
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

  return (
    <section className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
      <Ico icon={Sparkles} tone="violet" size={20} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">AI tags</p>
        <p className="text-xs text-slate-500">
          When you save something new, the AI adds up to 3 tags in <span className="rounded-full bg-violet-100 px-1.5 text-violet-800">purple</span>.
          You can add 2 of your own.
        </p>
        {failed && <p className="text-xs text-red-700">Couldn&apos;t save that. Try again.</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on === true}
        aria-label="AI tags"
        disabled={on === null}
        onClick={toggle}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-violet-600" : "bg-slate-300"} disabled:opacity-50`}
      >
        <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on ? "translate-x-5" : ""}`} />
      </button>
    </section>
  );
}
