"use client";

import BrandMark from "@/components/BrandMark";
import { askConfirm } from "@/components/ConfirmDialog";
import { SetupNotice, formatDate } from "@/components/ReadingLibrary";
import { isMissingTable, type Report } from "@/lib/report";
import { createClient } from "@/lib/supabase/client";
import { ReportIcon } from "@/components/ReportWriterLink";
import { ArrowLeft, FilePlus2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type Row = Pick<Report, "id" | "title" | "updated_at"> & { report_sources: { count: number }[] };

// Report Writer's home: your reports, newest first, and a button to start a new one.
export default function ReportsList({ userEmail }: { userEmail: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [reports, setReports] = useState<Row[] | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("reports")
      .select("id, title, updated_at, report_sources(count)")
      .order("updated_at", { ascending: false });
    if (error) {
      if (isMissingTable(error.message)) setNeedsSetup(true);
      else setError(error.message);
      setReports([]);
      return;
    }
    setReports(data as Row[]);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    setCreating(true);
    const { data, error } = await supabase.from("reports").insert({ title: "Untitled report" }).select("id").single();
    if (error) {
      setCreating(false);
      if (isMissingTable(error.message)) setNeedsSetup(true);
      else setError(error.message);
      return;
    }
    router.push(`/report/${data.id}`);
  }

  async function remove(report: Row) {
    const ok = await askConfirm({
      title: "Delete this report?",
      message: "Only the report is deleted. Your videos, readings, tutorials and their notes stay as they are.",
      quote: report.title,
      confirmLabel: "Delete report",
      danger: true,
    });
    if (!ok) return;
    const { error } = await supabase.from("reports").delete().eq("id", report.id);
    if (error) setError(error.message);
    else setReports((rows) => rows?.filter((r) => r.id !== report.id) ?? rows);
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <BrandMark />
        <Link href="/" className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100">
          <ArrowLeft size={16} aria-hidden /> My library
        </Link>
        <div className="ml-auto hidden items-center gap-2 text-sm text-slate-500 sm:flex">
          <span className="max-w-40 truncate">{userEmail}</span>
          <button onClick={signOut} className="rounded-md px-2 py-1 hover:bg-slate-100">
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        {needsSetup ? (
          <SetupNotice file="reports.sql" />
        ) : (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h1 className="mr-auto flex items-center gap-2 text-2xl font-bold text-slate-900">
                <ReportIcon size={34} /> Report Writer
              </h1>
              <button
                onClick={create}
                disabled={creating}
                className="flex items-center gap-1.5 rounded-md bg-[#2b3b5e] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#22304d] disabled:opacity-60"
              >
                <FilePlus2 size={16} aria-hidden />
                {creating ? "Starting…" : "New report"}
              </button>
            </div>
            <p className="mb-5 text-sm text-slate-600">
              Pick videos, readings and tutorials, and turn their notes into one report: put together as they are, or
              drafted by AI. Edit it, then copy it or download it for Word. Your notes themselves are never changed.
            </p>

            {error && <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

            {reports === null ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : reports.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
                <ReportIcon size={48} className="mx-auto mb-2" />
                No reports yet. Click <b>New report</b> to make your first one.
              </div>
            ) : (
              <ul className="divide-y divide-slate-200 rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
                {reports.map((r) => {
                  const count = r.report_sources?.[0]?.count ?? 0;
                  return (
                    <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                      <ReportIcon size={24} />
                      <Link href={`/report/${r.id}`} className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-slate-900 hover:underline">{r.title}</span>
                        <span className="text-xs text-slate-500">
                          {count} source{count === 1 ? "" : "s"} · edited {formatDate(r.updated_at)}
                        </span>
                      </Link>
                      <button
                        onClick={() => remove(r)}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        title="Delete report"
                        aria-label={`Delete ${r.title}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}
