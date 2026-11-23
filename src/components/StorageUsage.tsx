"use client";

import { Database, HardDrive } from "lucide-react";
import { useEffect, useState } from "react";
import { Ico, type Tone } from "@/components/Icon";
import { friendlyError } from "@/lib/errors";
import {
  bucketName,
  FREE_DATABASE_BYTES,
  FREE_FILE_BYTES,
  formatBytes,
  percentOf,
  tableName,
  type StorageStats,
} from "@/lib/storage-stats";
import type { createClient } from "@/lib/supabase/client";

// The Storage part of the AI usage page: database size, the biggest tables, and your files.
export default function StorageUsage({ supabase }: { supabase: ReturnType<typeof createClient> }) {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setupNeeded, setSetupNeeded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.rpc("storage_stats").then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        if (/storage_stats/.test(error.message)) setSetupNeeded(true);
        else setError(friendlyError(error.message));
        return;
      }
      setStats(data as StorageStats);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  if (setupNeeded)
    return (
      <section className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
        <p className="font-semibold">Storage: one step to turn this on</p>
        <p className="mt-1">
          Open Supabase, go to SQL Editor, New query, paste in the file <code>supabase/storage-stats.sql</code> and click Run.
        </p>
      </section>
    );
  if (error) return <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>;
  if (!stats) return <p className="text-slate-500">Loading storage…</p>;

  const fileBytes = stats.files.reduce((sum, f) => sum + f.bytes, 0);
  const fileCount = stats.files.reduce((sum, f) => sum + f.count, 0);
  const tables = stats.tables.filter((t) => t.bytes > 0).slice(0, 8);

  return (
    <section className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <h2 className="flex items-center gap-1.5 border-b border-slate-200 px-4 py-2.5 font-semibold">
        <Ico icon={HardDrive} tone="green" size={14} />
        Storage
      </h2>
      <div className="grid gap-4 p-4 md:grid-cols-2">
        <Meter icon={Database} tone="blue" color="bg-[#2563eb]" label="Database" used={stats.database_bytes} limit={FREE_DATABASE_BYTES} />
        <Meter
          icon={HardDrive}
          tone="green"
          color="bg-[#16a34a]"
          label={`Your files (${fileCount} ${fileCount === 1 ? "file" : "files"})`}
          used={fileBytes}
          limit={FREE_FILE_BYTES}
        />
      </div>
      <div className="grid gap-4 border-t border-slate-100 p-4 text-sm md:grid-cols-2">
        <div>
          <h3 className="mb-1 text-xs font-medium text-slate-500">Biggest tables</h3>
          <ul className="divide-y divide-slate-100">
            {tables.map((t) => (
              <li key={t.name} className="flex items-center gap-3 py-1.5">
                <span className="min-w-0 flex-1 truncate">{tableName(t.name)}</span>
                <span className="tabular-nums text-slate-500">{t.rows.toLocaleString()} rows</span>
                <span className="w-16 text-right tabular-nums">{formatBytes(t.bytes)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-1 text-xs font-medium text-slate-500">Your files</h3>
          {stats.files.length === 0 ? (
            <p className="py-1.5 text-slate-500">No files uploaded yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {stats.files.map((f) => (
                <li key={f.bucket} className="flex items-center gap-3 py-1.5">
                  <span className="min-w-0 flex-1 truncate">{bucketName(f.bucket)}</span>
                  <span className="tabular-nums text-slate-500">
                    {f.count} {f.count === 1 ? "file" : "files"}
                  </span>
                  <span className="w-16 text-right tabular-nums">{formatBytes(f.bytes)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
        Limits shown are Supabase&apos;s free plan: 500 MB of database and 1 GB of files. Table sizes include their indexes; row counts are
        Postgres&apos;s estimate and cover everyone&apos;s rows.
      </p>
    </section>
  );
}

function Meter({
  icon,
  tone,
  color,
  label,
  used,
  limit,
}: {
  icon: typeof Database;
  tone: Tone;
  color: string;
  label: string;
  used: number;
  limit: number;
}) {
  const percent = percentOf(used, limit);
  const bar = percent >= 90 ? "bg-red-500" : percent >= 70 ? "bg-amber-500" : color;
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <Ico icon={icon} tone={tone} size={14} />
        {label}
      </p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums">{formatBytes(used)}</span>
        <span className="text-xs text-slate-500">
          of {formatBytes(limit)} · {percent}%
        </span>
      </p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
    </div>
  );
}
