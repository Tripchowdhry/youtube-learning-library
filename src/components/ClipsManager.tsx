"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { clipUrl, clipVideos, deleteClips, listClips, type StoredClip } from "@/lib/clips";
import { createClient } from "@/lib/supabase/client";
import type { NotePage } from "@/lib/types";

// The free Supabase plan includes 1 GB of file storage.
const FREE_STORAGE = 1024 ** 3;

type NoteRow = { video_id: string; pages: NotePage[] | null; text: string | null };
type Month = { key: string; label: string; clips: StoredClip[]; size: number };
type Year = { year: string; months: Month[]; count: number; size: number };

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function groupByMonth(clips: StoredClip[], newestFirst: boolean): Year[] {
  const sorted = [...clips].sort((a, b) =>
    newestFirst ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt),
  );
  const years: Year[] = [];
  for (const clip of sorted) {
    const date = new Date(clip.createdAt);
    const year = String(date.getFullYear());
    const key = `${year}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    let y = years.find((x) => x.year === year);
    if (!y) years.push((y = { year, months: [], count: 0, size: 0 }));
    let m = y.months.find((x) => x.key === key);
    if (!m) y.months.push((m = { key, label: date.toLocaleString(undefined, { month: "long" }), clips: [], size: 0 }));
    m.clips.push(clip);
    m.size += clip.size;
    y.count += 1;
    y.size += clip.size;
  }
  return years;
}

export default function ClipsManager() {
  const supabase = useMemo(() => createClient(), []);
  const [clips, setClips] = useState<StoredClip[] | null>(null);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [titles, setTitles] = useState<Map<string, string>>(new Map());
  const [newestFirst, setNewestFirst] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [stored, n, v] = await Promise.all([
        listClips(supabase),
        supabase.from("notes").select("video_id, pages, text"),
        supabase.from("videos").select("id, title"),
      ]);
      if (n.error) throw new Error(n.error.message);
      setNotes((n.data ?? []) as NoteRow[]);
      setTitles(new Map((v.data ?? []).map((x) => [x.id as string, (x.title as string) || "Untitled video"])));
      setClips(stored);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your clips.");
    }
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const where = useMemo(() => clipVideos(notes), [notes]);
  const years = useMemo(() => groupByMonth(clips ?? [], newestFirst), [clips, newestFirst]);
  const used = (clips ?? []).reduce((total, c) => total + c.size, 0);
  const unused = (clips ?? []).filter((c) => !where.has(c.path));

  async function remove(label: string, list: StoredClip[]) {
    const message = `Delete ${list.length} ${list.length === 1 ? "clip" : "clips"} from ${label}? They will also disappear from your notes. This can't be undone.`;
    if (!window.confirm(message)) return;
    setBusy(label);
    setError(null);
    try {
      await deleteClips(
        supabase,
        notes,
        list.map((c) => c.path),
      );
      await load();
    } catch (e) {
      setError(`Couldn't delete: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <Link href="/" className="rounded-md px-2 py-1 text-sm hover:bg-slate-100">
          ← Library
        </Link>
        <h1 className="text-lg font-bold">Manage clips</h1>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
        {error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
        {!clips ? (
          !error && <p className="text-slate-500">Loading your clips…</p>
        ) : (
          <>
            <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <p className="text-sm text-slate-600">
                <span className="font-semibold text-slate-900">
                  {clips.length} {clips.length === 1 ? "clip" : "clips"}
                </span>{" "}
                using {formatSize(used)} of your 1 GB free space
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-slate-700"
                  style={{ width: `${Math.min(100, Math.max(used ? 1 : 0, (used / FREE_STORAGE) * 100))}%` }}
                />
              </div>
              {unused.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-slate-600">
                    {unused.length} {unused.length === 1 ? "clip isn't" : "clips aren't"} in any notes anymore (
                    {formatSize(unused.reduce((t, c) => t + c.size, 0))}).
                  </span>
                  <button
                    onClick={() => remove("unused clips", unused)}
                    disabled={!!busy}
                    className="rounded-md px-2.5 py-1 text-red-700 ring-1 ring-slate-300 hover:bg-red-50 disabled:opacity-50"
                  >
                    Delete unused clips
                  </button>
                </div>
              )}
            </section>

            {clips.length === 0 ? (
              <p className="text-slate-500">No clips yet. Press 📷 Clip on a video&rsquo;s notes to add one.</p>
            ) : (
              <>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-slate-500">Order:</span>
                  {[
                    { label: "Newest first", value: true },
                    { label: "Oldest first", value: false },
                  ].map((o) => (
                    <button
                      key={o.label}
                      onClick={() => setNewestFirst(o.value)}
                      className={`rounded-md px-2.5 py-1 ring-1 ring-slate-300 ${
                        newestFirst === o.value ? "bg-slate-900 text-white" : "bg-white hover:bg-slate-100"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>

                {years.map((y) => (
                  <section key={y.year} className="flex flex-col gap-2">
                    <h2 className="text-base font-semibold">
                      {y.year}{" "}
                      <span className="text-sm font-normal text-slate-500">
                        · {y.count} {y.count === 1 ? "clip" : "clips"} · {formatSize(y.size)}
                      </span>
                    </h2>
                    {y.months.map((m) => (
                      <details key={m.key} className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
                        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
                          <span className="font-medium">{m.label}</span>
                          <span className="text-sm text-slate-500">
                            {m.clips.length} {m.clips.length === 1 ? "clip" : "clips"} · {formatSize(m.size)}
                          </span>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              remove(`${m.label} ${y.year}`, m.clips);
                            }}
                            disabled={!!busy}
                            className="ml-auto rounded-md px-2.5 py-1 text-sm text-red-700 ring-1 ring-slate-300 hover:bg-red-50 disabled:opacity-50"
                          >
                            {busy === `${m.label} ${y.year}` ? "Deleting…" : "🗑 Delete this month"}
                          </button>
                        </summary>
                        <div className="grid grid-cols-2 gap-2 border-t border-slate-100 p-3 sm:grid-cols-4">
                          {m.clips.map((c) => {
                            const videoId = where.get(c.path);
                            return (
                              <Link
                                key={c.path}
                                href={videoId ? `/video/${videoId}` : clipUrl(supabase, c.path)}
                                className="group block overflow-hidden rounded-md ring-1 ring-slate-200"
                              >
                                <img
                                  src={clipUrl(supabase, c.path)}
                                  alt="Clip"
                                  loading="lazy"
                                  className="block aspect-video w-full bg-slate-100 object-cover"
                                />
                                <span className="block truncate px-2 py-1 text-xs text-slate-600 group-hover:underline">
                                  {videoId ? (titles.get(videoId) ?? "Video") : "Not in any notes"}
                                </span>
                              </Link>
                            );
                          })}
                        </div>
                      </details>
                    ))}
                  </section>
                ))}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
