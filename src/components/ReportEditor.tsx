"use client";

import { askConfirm } from "@/components/ConfirmDialog";
import { Ico, type Tone } from "@/components/Icon";
import { SetupNotice } from "@/components/ReadingLibrary";
import {
  compileReport,
  hasNotes,
  isMissingTable,
  loadSources,
  parseReport,
  pictureUrl,
  sourceKey,
  sourcesSection,
  type Block,
  type Inline,
  type Report,
  type ReportSource,
  type SourceKind,
  type SourceSection,
} from "@/lib/report";
import { copyReport, downloadWord } from "@/lib/report-export";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Clapperboard,
  Copy,
  Eye,
  FileDown,
  FileText,
  GraduationCap,
  Layers,
  Pencil,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Chosen = { kind: SourceKind; id: string };
type SaveState = "saved" | "saving" | "error";

const TABS: { key: SourceSection; name: string; Icon: LucideIcon; tone: Tone }[] = [
  { key: "videos", name: "Videos", Icon: Clapperboard, tone: "violet" },
  { key: "reading", name: "Reading", Icon: FileText, tone: "sky" },
  { key: "tutorial", name: "Tutorials", Icon: GraduationCap, tone: "indigo" },
];
const TAB = Object.fromEntries(TABS.map((t) => [t.key, t])) as Record<SourceSection, (typeof TABS)[number]>;

// What's in an item's notes, in a few words.
function notesSummary(s: ReportSource) {
  const bits: string[] = [];
  if (s.notes.trim()) bits.push("typed notes");
  if (s.clips.length) bits.push(`${s.clips.length} clip${s.clips.length === 1 ? "" : "s"}`);
  if (s.handPages) bits.push(`${s.handPages} handwritten page${s.handPages === 1 ? "" : "s"}`);
  return bits.length ? bits.join(", ") : "no notes yet";
}

// One report: choose the notes, build it (as they are, or with AI), then edit, copy or download it.
export default function ReportEditor({ reportId }: { reportId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [report, setReport] = useState<Report | null>(null);
  const [missing, setMissing] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);

  const [sources, setSources] = useState<ReportSource[] | null>(null);
  const [sourcesError, setSourcesError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Chosen[]>([]);
  const [picking, setPicking] = useState(false);
  const [tab, setTab] = useState<SourceSection>("videos");
  const [query, setQuery] = useState("");
  const [onlyWithNotes, setOnlyWithNotes] = useState(true);

  const [focus, setFocus] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [toast, setToast] = useState<{ text: string; isError?: boolean } | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const notify = useCallback((text: string, isError = false) => {
    setToast({ text, isError });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ---------- Loading ----------

  useEffect(() => {
    (async () => {
      const [r, rs] = await Promise.all([
        supabase.from("reports").select("*").eq("id", reportId).maybeSingle(),
        supabase.from("report_sources").select("source_kind, source_id, position").eq("report_id", reportId).order("position"),
      ]);
      const error = r.error ?? rs.error;
      if (error) {
        if (isMissingTable(error.message)) setNeedsSetup(true);
        else setSaveError(error.message);
        return;
      }
      if (!r.data) {
        setMissing(true);
        return;
      }
      const row = r.data as Report;
      setReport(row);
      setTitle(row.title);
      setBody(row.body ?? "");
      const list = (rs.data ?? []).map((x) => ({ kind: x.source_kind as SourceKind, id: x.source_id as string }));
      setChosen(list);
      setPicking(list.length === 0);
    })();
    loadSources(supabase)
      .then(setSources)
      .catch((e: Error) => setSourcesError(e.message));
  }, [supabase, reportId]);

  const byKey = useMemo(() => new Map((sources ?? []).map((s) => [sourceKey(s), s])), [sources]);
  const chosenSources = useMemo(
    () => chosen.map((c) => byKey.get(sourceKey(c))).filter((s): s is ReportSource => Boolean(s)),
    [chosen, byKey],
  );
  const chosenKeys = useMemo(() => new Set(chosen.map(sourceKey)), [chosen]);

  // ---------- Saving ----------

  const lastSaved = useRef({ title: "", body: "" });
  useEffect(() => {
    if (report) lastSaved.current = { title: report.title, body: report.body };
  }, [report]);

  const saveText = useCallback(
    async (nextTitle: string, nextBody: string) => {
      const cleanTitle = nextTitle.trim().slice(0, 200) || "Untitled report";
      setSaveState("saving");
      const { error } = await supabase
        .from("reports")
        .update({ title: cleanTitle, body: nextBody, updated_at: new Date().toISOString() })
        .eq("id", reportId);
      if (!mounted.current) return;
      if (error) {
        setSaveState("error");
        setSaveError(error.message);
      } else {
        lastSaved.current = { title: nextTitle, body: nextBody };
        setSaveState("saved");
        setSaveError(null);
      }
    },
    [supabase, reportId],
  );

  // Saves a moment after typing stops.
  useEffect(() => {
    if (!report) return;
    if (title === lastSaved.current.title && body === lastSaved.current.body) return;
    const timer = setTimeout(() => saveText(title, body), 800);
    return () => clearTimeout(timer);
  }, [report, title, body, saveText]);

  // The chosen items are saved one change after another, so they never arrive out of order.
  const sourceSaves = useRef(Promise.resolve());
  const saveChosen = useCallback(
    (list: Chosen[]) => {
      sourceSaves.current = sourceSaves.current.then(async () => {
        const del = await supabase.from("report_sources").delete().eq("report_id", reportId);
        const ins = list.length
          ? await supabase.from("report_sources").insert(
              list.map((c, i) => ({ report_id: reportId, source_kind: c.kind, source_id: c.id, position: i })),
            )
          : { error: null };
        const error = del.error ?? ins.error;
        if (error && mounted.current) notify(`Couldn't save the chosen items: ${error.message}`, true);
      });
    },
    [supabase, reportId, notify],
  );

  function updateChosen(next: Chosen[]) {
    setChosen(next);
    saveChosen(next);
  }

  function toggle(s: ReportSource) {
    const key = sourceKey(s);
    updateChosen(chosenKeys.has(key) ? chosen.filter((c) => sourceKey(c) !== key) : [...chosen, { kind: s.kind, id: s.id }]);
  }

  function move(index: number, by: number) {
    const next = [...chosen];
    const to = index + by;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    updateChosen(next);
  }

  // ---------- Building ----------

  async function okToReplace() {
    if (!body.trim()) return true;
    return askConfirm({
      title: "Replace the report text?",
      message: "The text below, with any edits you made, is replaced by the new version. Your notes themselves aren't changed.",
      confirmLabel: "Replace it",
    });
  }

  async function compile() {
    if (!chosenSources.length) return notify("Choose at least one video, reading or tutorial first.", true);
    if (!(await okToReplace())) return;
    setBody(compileReport(title.trim() || "Untitled report", chosenSources));
    setView("preview");
  }

  async function draftWithAi() {
    if (!chosenSources.length) return notify("Choose at least one video, reading or tutorial first.", true);
    if (!(await okToReplace())) return;
    setAiBusy(true);
    setAiError(null);
    const reportTitle = title.trim() || "Untitled report";
    try {
      const res = await fetch("/api/report-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: reportTitle, prompt: focus, sources: chosen }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message =
          res.status === 504 ? "The AI took too long. Try fewer items, or try again in a minute." : (data.error ?? `The AI couldn't write the report (error ${res.status}).`);
        if (mounted.current) setAiError(message);
        return;
      }
      const draft = `# ${reportTitle}\n\n${String(data.text ?? "").trim()}${sourcesSection(data.sources ?? [])}\n`;
      // Saved straight away, so the draft isn't lost if this page was closed meanwhile.
      await saveText(reportTitle, draft);
      if (mounted.current) {
        setBody(draft);
        setView("preview");
        notify(data.model ? `Drafted by ${data.model}. Check it against your notes.` : "Draft ready.");
      }
    } catch {
      if (mounted.current) setAiError("The AI couldn't be reached. Check your connection and try again.");
    } finally {
      if (mounted.current) setAiBusy(false);
    }
  }

  // ---------- Export ----------

  const resolve = useCallback((src: string) => pictureUrl(supabase, src), [supabase]);
  const [exporting, setExporting] = useState(false);

  async function copy() {
    try {
      await copyReport(body, resolve);
      notify("Copied. Paste it into Word, Google Docs or an email.");
    } catch {
      notify("Couldn't copy. Select the text and copy it instead.", true);
    }
  }

  async function word() {
    setExporting(true);
    try {
      await downloadWord(title.trim() || "Report", body, resolve);
    } catch {
      notify("Couldn't make the Word file. Try again.", true);
    } finally {
      setExporting(false);
    }
  }

  // ---------- Picker list ----------

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (sources ?? []).filter(
      (s) =>
        s.section === tab &&
        (!onlyWithNotes || hasNotes(s) || chosenKeys.has(sourceKey(s))) &&
        (!q || `${s.title} ${s.sub ?? ""} ${s.category ?? ""} ${s.notes}`.toLowerCase().includes(q)),
    );
  }, [sources, tab, query, onlyWithNotes, chosenKeys]);

  const tabCount = (section: SourceSection) => chosenSources.filter((s) => s.section === section).length;

  // ---------- Page ----------

  if (needsSetup) {
    return (
      <Shell title="Report">
        <SetupNotice file="reports.sql" />
      </Shell>
    );
  }
  if (missing) {
    return (
      <Shell title="Report">
        <p className="text-slate-600">
          This report can&apos;t be found. It may have been deleted.{" "}
          <Link href="/reports" className="text-blue-600 underline">
            Back to your reports
          </Link>
        </p>
      </Shell>
    );
  }
  if (!report) {
    return (
      <Shell title="Report">
        <p className="text-sm text-slate-500">{saveError ?? "Loading…"}</p>
      </Shell>
    );
  }

  const blocks = parseReport(body);

  return (
    <Shell
      title={
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          aria-label="Report title"
          className="min-w-0 flex-1 rounded-md border border-transparent px-2 py-1 text-lg font-semibold hover:border-slate-300 focus:border-blue-500 focus:outline-none"
        />
      }
      status={saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved" : "Saved"}
    >
      {saveError && <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{saveError}</p>}

      {/* 1. Choose */}
      <section className="mb-5 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="mr-auto font-semibold">
            1. Choose notes <span className="font-normal text-slate-500">({chosen.length} chosen)</span>
          </h2>
          <button
            onClick={() => setPicking((p) => !p)}
            className="rounded-md border border-slate-300 px-2.5 py-1 text-sm hover:bg-slate-50"
          >
            {picking ? "Done choosing" : "Add or remove"}
          </button>
        </div>

        {chosen.length > 0 && (
          <ol className="mb-3 space-y-1">
            {chosen.map((c, i) => {
              const s = byKey.get(sourceKey(c));
              const tabInfo = s ? TAB[s.section] : null;
              return (
                <li key={sourceKey(c)} className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-sm">
                  <span className="w-5 text-right text-slate-400">{i + 1}.</span>
                  {tabInfo && <Ico icon={tabInfo.Icon} tone={tabInfo.tone} />}
                  <span className="min-w-0 flex-1 truncate">
                    {s ? s.title : sources ? <i className="text-slate-500">Removed from your library</i> : "…"}
                  </span>
                  {s && <span className="hidden text-xs text-slate-500 sm:inline">{notesSummary(s)}</span>}
                  <IconButton label="Move up" onClick={() => move(i, -1)} disabled={i === 0} Icon={ArrowUp} />
                  <IconButton label="Move down" onClick={() => move(i, 1)} disabled={i === chosen.length - 1} Icon={ArrowDown} />
                  <IconButton label="Remove" onClick={() => updateChosen(chosen.filter((_, j) => j !== i))} Icon={X} />
                </li>
              );
            })}
          </ol>
        )}

        {picking && (
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <nav className="flex rounded-lg bg-slate-100 p-0.5">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium ${tab === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
                  >
                    <Ico icon={t.Icon} tone={t.tone} />
                    {t.name}
                    {tabCount(t.key) > 0 && <span className="text-xs text-blue-600">{tabCount(t.key)}</span>}
                  </button>
                ))}
              </nav>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search titles, categories and notes…"
                className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
              <label className="flex items-center gap-1.5 text-sm text-slate-600">
                <input type="checkbox" checked={onlyWithNotes} onChange={(e) => setOnlyWithNotes(e.target.checked)} />
                Only ones with notes
              </label>
            </div>
            {sourcesError ? (
              <p className="text-sm text-red-700">{sourcesError}</p>
            ) : !sources ? (
              <p className="text-sm text-slate-500">Loading your library…</p>
            ) : visible.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">Nothing here{onlyWithNotes ? " with notes yet" : ""}.</p>
            ) : (
              <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
                {visible.map((s) => (
                  <li key={sourceKey(s)}>
                    <label className="flex cursor-pointer items-start gap-2 px-1 py-2 hover:bg-slate-50">
                      <input type="checkbox" className="mt-1" checked={chosenKeys.has(sourceKey(s))} onChange={() => toggle(s)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{s.title}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {[s.category ?? "Uncategorized", s.sub, notesSummary(s)].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* 2. Build */}
      <section className="mb-5 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-3 font-semibold">2. Build the report</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="mb-1 flex items-center gap-1.5 font-medium">
              <Ico icon={Layers} tone="slate" /> Put my notes together
            </p>
            <p className="mb-3 text-sm text-slate-600">
              No AI. Each item&apos;s notes go under its own heading, with its link and clips, in the order above.
            </p>
            <button
              onClick={compile}
              disabled={aiBusy}
              className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-60"
            >
              Put together
            </button>
          </div>
          <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3">
            <p className="mb-1 flex items-center gap-1.5 font-medium">
              <Ico icon={Sparkles} tone="violet" /> Draft with AI
            </p>
            <p className="mb-2 text-sm text-slate-600">
              Gemini writes one report from your typed notes, marking each point with its source like [2].
            </p>
            <textarea
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Optional: what should it focus on? E.g. “Compare the approaches and end with next steps.”"
              className="mb-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
            <button
              onClick={draftWithAi}
              disabled={aiBusy}
              className="flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
            >
              <Sparkles size={14} aria-hidden />
              {aiBusy ? "Writing… (up to a minute or two)" : "Draft with AI"}
            </button>
            {aiError && <p className="mt-2 text-sm text-red-700">{aiError}</p>}
          </div>
        </div>
      </section>

      {/* 3. Edit and export */}
      <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="mr-auto font-semibold">3. Edit and export</h2>
          <nav className="flex rounded-lg bg-slate-100 p-0.5">
            {(
              [
                ["edit", "Edit", Pencil],
                ["preview", "Preview", Eye],
              ] as const
            ).map(([key, name, Icon]) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium ${view === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
              >
                <Icon size={14} aria-hidden />
                {name}
              </button>
            ))}
          </nav>
          <button
            onClick={copy}
            disabled={!body.trim()}
            className="flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            <Copy size={14} aria-hidden /> Copy
          </button>
          <button
            onClick={word}
            disabled={!body.trim() || exporting}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-2.5 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <FileDown size={14} aria-hidden /> {exporting ? "Making file…" : "Download Word"}
          </button>
        </div>

        {view === "edit" ? (
          <>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={22}
              placeholder="Build the report above, or start typing here."
              className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm leading-relaxed"
            />
            <p className="mt-1 text-xs text-slate-500">
              # Title, ## Heading, - bullet, 1. step, **bold**. A line like ![caption](picture) shows a picture.
            </p>
          </>
        ) : blocks.length ? (
          <article className="max-w-none text-slate-800">
            {blocks.map((b, i) => (
              <PreviewBlock key={i} block={b} resolve={resolve} />
            ))}
          </article>
        ) : (
          <p className="py-6 text-center text-sm text-slate-500">Nothing yet. Build the report above, or type it in Edit.</p>
        )}
      </section>

      {toast && (
        <div
          className={`fixed bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-lg px-4 py-2 text-sm text-white shadow-lg ${toast.isError ? "bg-red-600" : "bg-slate-900"}`}
        >
          {toast.text}
        </div>
      )}
    </Shell>
  );
}

// ---------- Pieces ----------

function Shell({ title, status, children }: { title: React.ReactNode; status?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-3">
        <Link href="/reports" className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100">
          <ArrowLeft size={16} aria-hidden /> Reports
        </Link>
        {typeof title === "string" ? <span className="text-lg font-semibold">{title}</span> : title}
        {status && <span className="shrink-0 text-xs text-slate-500">{status}</span>}
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}

function IconButton({ label, onClick, disabled, Icon }: { label: string; onClick: () => void; disabled?: boolean; Icon: LucideIcon }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="rounded p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-800 disabled:opacity-30 disabled:hover:bg-transparent"
    >
      <Icon size={14} />
    </button>
  );
}

function InlineText({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) => {
        const text = p.bold ? <strong>{p.text}</strong> : p.text;
        return p.href ? (
          <a key={i} href={p.href} target="_blank" rel="noreferrer" className="text-blue-600 underline">
            {text}
          </a>
        ) : (
          <span key={i}>{text}</span>
        );
      })}
    </>
  );
}

function PreviewBlock({ block: b, resolve }: { block: Block; resolve: (src: string) => string }) {
  switch (b.type) {
    case "h1":
      return (
        <h1 className="mb-4 text-2xl font-bold">
          <InlineText parts={b.inline} />
        </h1>
      );
    case "h2":
      return (
        <h2 className="mt-6 mb-2 text-xl font-semibold">
          <InlineText parts={b.inline} />
        </h2>
      );
    case "h3":
      return (
        <h3 className="mt-4 mb-1 font-semibold">
          <InlineText parts={b.inline} />
        </h3>
      );
    case "li":
      return (
        <p className="relative mb-1 pl-5 before:absolute before:left-1.5 before:content-['•']">
          <InlineText parts={b.inline} />
        </p>
      );
    case "ol":
      return (
        <p className="mb-1 pl-5 -indent-4">
          {b.num}. <InlineText parts={b.inline} />
        </p>
      );
    case "quote":
      return (
        <blockquote className="mb-2 border-l-4 border-slate-300 pl-3 text-slate-600">
          <InlineText parts={b.inline} />
        </blockquote>
      );
    case "img":
      return (
        <figure className="my-3">
          <img src={resolve(b.src)} alt={b.caption || "Picture from the notes"} className="max-w-full rounded-md ring-1 ring-slate-200 sm:max-w-xl" />
          {b.caption && <figcaption className="mt-1 text-xs text-slate-500 italic">{b.caption}</figcaption>}
        </figure>
      );
    default:
      return (
        <p className="mb-2">
          <InlineText parts={b.inline} />
        </p>
      );
  }
}
