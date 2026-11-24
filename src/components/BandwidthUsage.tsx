"use client";

import { ArrowDownUp, CalendarClock, Database, Globe } from "lucide-react";
import { useEffect, useState } from "react";
import { Ico } from "@/components/Icon";
import { Meter } from "@/components/StorageUsage";
import {
  FREE_SUPABASE_BYTES,
  FREE_VERCEL_BYTES,
  monthName,
  nextReset,
  previousMonth,
  projectedForMonth,
  totalsFor,
  type BandwidthSource,
  type BandwidthStats,
} from "@/lib/bandwidth";
import { friendlyError } from "@/lib/errors";
import { formatBytes } from "@/lib/storage-stats";
import type { createClient } from "@/lib/supabase/client";

const SOURCES: { source: BandwidthSource; label: string; icon: typeof Database; tone: "blue" | "green"; color: string; limit: number }[] = [
  { source: "supabase", label: "Supabase: database, files and sign-in", icon: Database, tone: "blue", color: "bg-[#2563eb]", limit: FREE_SUPABASE_BYTES },
  { source: "vercel", label: "Vercel: the app's pages", icon: Globe, tone: "green", color: "bg-[#16a34a]", limit: FREE_VERCEL_BYTES },
];

// The Bandwidth part of the AI usage page: this month's data sent by Supabase and by Vercel,
// against each free plan's monthly limit. The count starts again on the 1st.
export default function BandwidthUsage({ supabase }: { supabase: ReturnType<typeof createClient> }) {
  const [stats, setStats] = useState<BandwidthStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setupNeeded, setSetupNeeded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.rpc("bandwidth_stats").then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        if (/bandwidth_stats/.test(error.message)) setSetupNeeded(true);
        else setError(friendlyError(error.message));
        return;
      }
      setStats(data as BandwidthStats);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  if (setupNeeded)
    return (
      <section className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
        <p className="font-semibold">Bandwidth: one step to turn this on</p>
        <p className="mt-1">
          Open Supabase, go to SQL Editor, New query, paste in the file <code>supabase/bandwidth.sql</code> and click Run. From then on, the
          app counts what it downloads and shows it here.
        </p>
      </section>
    );
  if (error) return <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>;
  if (!stats) return <p className="text-slate-500">Loading bandwidth…</p>;

  const { reset, days } = nextReset();
  const resetDay = reset.toLocaleDateString(undefined, { month: "long", day: "numeric", timeZone: "UTC" });
  const lastMonth = monthName(previousMonth(stats.month));

  return (
    <section className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <h2 className="flex flex-wrap items-center gap-x-1.5 gap-y-1 border-b border-slate-200 px-4 py-2.5 font-semibold">
        <Ico icon={ArrowDownUp} tone="amber" size={14} />
        Bandwidth in {monthName(stats.month)}
        <span className="ml-auto flex items-center gap-1 text-xs font-normal text-slate-500">
          <Ico icon={CalendarClock} tone="slate" size={13} />
          Starts again {resetDay} (in {days} {days === 1 ? "day" : "days"})
        </span>
      </h2>
      <div className="grid gap-4 p-4 md:grid-cols-2">
        {SOURCES.map((s) => {
          const { now, last } = totalsFor(stats, s.source);
          const projected = projectedForMonth(now.bytes);
          const over = projected > s.limit;
          return (
            <div key={s.source}>
              <Meter icon={s.icon} tone={s.tone} color={s.color} label={s.label} used={now.bytes} limit={s.limit} />
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-slate-500">At this pace</dt>
                <dd className={`text-right tabular-nums ${over ? "font-medium text-red-700" : ""}`}>
                  about {formatBytes(projected)} by month end{over ? ", over the limit" : ""}
                </dd>
                <dt className="text-slate-500">You</dt>
                <dd className="text-right tabular-nums">
                  {formatBytes(now.myBytes)}
                  {now.people > 1 && <span className="text-slate-500"> of {now.people} people</span>}
                </dd>
                <dt className="text-slate-500">Requests</dt>
                <dd className="text-right tabular-nums">{now.requests.toLocaleString()}</dd>
                <dt className="text-slate-500">{lastMonth}</dt>
                <dd className="text-right tabular-nums text-slate-500">{last.bytes ? formatBytes(last.bytes) : "–"}</dd>
              </dl>
            </div>
          );
        })}
      </div>
      <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
        Limits shown are the free plans: Supabase&apos;s 5 GB of egress and Vercel&apos;s 100 GB of data transfer a month, shared by everyone who
        uses the app. Neither lets the app read these numbers, so BrainShelf counts what each signed-in browser downloads; treat them as a
        close estimate. For the exact figures, see the Usage page in{" "}
        <a href="https://supabase.com/dashboard/org/_/usage" target="_blank" rel="noreferrer" className="text-blue-700 underline">
          Supabase
        </a>{" "}
        and in{" "}
        <a href="https://vercel.com/dashboard/usage" target="_blank" rel="noreferrer" className="text-blue-700 underline">
          Vercel
        </a>
        .
      </p>
    </section>
  );
}
