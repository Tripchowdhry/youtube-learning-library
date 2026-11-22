"use client";

import { Activity, CircleCheck, Clock, Coins, Repeat } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Ico, type Tone } from "@/components/Icon";
import { friendlyError } from "@/lib/errors";
import { fetchAll } from "@/lib/fetch-all";
import { featureName, formatDuration, formatTokens, outcome, summarise, type Group, type UsageLogRow } from "@/lib/ai-usage-stats";
import { createClient } from "@/lib/supabase/client";

const RANGES = [
  { key: "today", label: "Today" },
  { key: "week", label: "Last 7 days" },
  { key: "month", label: "Last 30 days" },
] as const;
type Range = (typeof RANGES)[number]["key"];

function since(range: Range) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (range === "week") start.setDate(start.getDate() - 6);
  if (range === "month") start.setDate(start.getDate() - 29);
  return start.toISOString();
}

// How BrainShelf's AI has been doing: answers, speed, tokens and which models did the work.
export default function AiUsage() {
  const supabase = useMemo(() => createClient(), []);
  const [range, setRange] = useState<Range>("today");
  const [rows, setRows] = useState<UsageLogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setupNeeded, setSetupNeeded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    fetchAll<UsageLogRow>((from, to) =>
      supabase
        .from("ai_usage")
        .select("created_at, feature, model, status, ok, ms, input_tokens, output_tokens, handed_off")
        .gte("created_at", since(range))
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to),
    ).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        if (/ai_usage/.test(error.message)) setSetupNeeded(true);
        else setError(friendlyError(error.message));
        setRows([]);
        return;
      }
      setRows(data ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, range]);

  const stats = useMemo(() => summarise(rows ?? []), [rows]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <Link href="/" className="rounded-md px-2 py-1 text-sm hover:bg-slate-100">
          ← Library
        </Link>
        <h1 className="text-lg font-bold">AI usage</h1>
      </header>

      <main className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
        {setupNeeded ? (
          <section className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
            <p className="font-semibold">One step to turn this on</p>
            <p className="mt-1">
              Open Supabase, go to SQL Editor, New query, paste in the file <code>supabase/ai-usage.sql</code> and click Run. From then on,
              every AI request is counted here. Your AI works the same either way.
            </p>
          </section>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  onClick={() => setRange(r.key)}
                  className={`rounded-md px-2.5 py-1 ring-1 ring-slate-300 ${range === r.key ? "bg-slate-900 text-white" : "bg-white hover:bg-slate-100"}`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
            {!rows ? (
              <p className="text-slate-500">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="text-slate-500">No AI requests {range === "today" ? "today" : "in this time"} yet.</p>
            ) : (
              <>
                <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Stat icon={CircleCheck} tone="green" label="Answers" value={String(stats.total.answers)} sub={stats.total.failures ? `${stats.total.failures} failed` : "none failed"} />
                  <Stat
                    icon={Activity}
                    tone="blue"
                    label="Success rate"
                    value={stats.successRate === null ? "–" : `${Math.round(stats.successRate * 100)}%`}
                    sub={`${stats.total.handoffs} ${stats.total.handoffs === 1 ? "hand-off" : "hand-offs"} to another model`}
                  />
                  <Stat icon={Clock} tone="amber" label="Average answer time" value={formatDuration(stats.total.avgMs)} sub={`${stats.total.timeouts} over 5 minutes`} />
                  <Stat
                    icon={Coins}
                    tone="violet"
                    label="Tokens"
                    value={formatTokens(stats.total.tokens)}
                    sub={`${formatTokens(stats.inputTokens)} in · ${formatTokens(stats.outputTokens)} out`}
                  />
                </section>

                <Table title="By AI model" groups={stats.byModel} showLimits />
                <Table title="By feature" groups={stats.byFeature} />

                <section className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
                  <h2 className="border-b border-slate-200 px-4 py-2.5 font-semibold">Latest requests</h2>
                  <ul className="divide-y divide-slate-100 text-sm">
                    {rows.slice(0, 20).map((r, i) => (
                      <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2">
                        <span className="w-36 shrink-0 text-slate-500">
                          {new Date(r.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{featureName(r.feature)}</span>
                        <span className="text-slate-600">{r.model}</span>
                        <span className={r.ok ? "text-green-700" : r.handed_off ? "text-amber-700" : "text-red-700"}>{outcome(r)}</span>
                        <span className="w-12 text-right tabular-nums text-slate-500">{formatDuration(r.ms)}</span>
                        <span className="w-14 text-right tabular-nums text-slate-500">{formatTokens(r.input_tokens + r.output_tokens)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              </>
            )}
            <p className="text-xs text-slate-500">
              Tokens are the pieces of text, pictures and video the AI reads and writes, as Google counts them. Google doesn&apos;t say how much of
              the free limit is left, so this shows what&apos;s been used. Requests older than 30 days are deleted.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function Stat({ icon, tone, label, value, sub }: { icon: typeof Clock; tone: Tone; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <Ico icon={icon} tone={tone} size={14} />
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-slate-500">{sub}</p>
    </div>
  );
}

function Table({ title, groups, showLimits }: { title: string; groups: Group[]; showLimits?: boolean }) {
  return (
    <section className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <h2 className="flex items-center gap-1.5 border-b border-slate-200 px-4 py-2.5 font-semibold">
        {showLimits && <Ico icon={Repeat} tone="slate" size={14} />}
        {title}
      </h2>
      <table className="w-full min-w-[34rem] text-sm">
        <thead className="text-left text-xs text-slate-500">
          <tr>
            <th className="px-4 py-2 font-medium"></th>
            <th className="px-2 py-2 text-right font-medium">Answers</th>
            <th className="px-2 py-2 text-right font-medium">Failed</th>
            <th className="px-2 py-2 text-right font-medium">Handed off</th>
            {showLimits && <th className="px-2 py-2 text-right font-medium">Limit hit</th>}
            <th className="px-2 py-2 text-right font-medium">Avg time</th>
            <th className="px-4 py-2 text-right font-medium">Tokens</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 tabular-nums">
          {groups.map((g) => (
            <tr key={g.name}>
              <td className="px-4 py-2">{g.name}</td>
              <td className="px-2 py-2 text-right">{g.answers}</td>
              <td className={`px-2 py-2 text-right ${g.failures ? "text-red-700" : "text-slate-400"}`}>{g.failures}</td>
              <td className={`px-2 py-2 text-right ${g.handoffs ? "text-amber-700" : "text-slate-400"}`}>{g.handoffs}</td>
              {showLimits && <td className={`px-2 py-2 text-right ${g.limitHits ? "text-amber-700" : "text-slate-400"}`}>{g.limitHits}</td>}
              <td className="px-2 py-2 text-right">{g.answers ? formatDuration(g.avgMs) : "–"}</td>
              <td className="px-4 py-2 text-right">{formatTokens(g.tokens)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
