"use client";

import HomeLink from "@/components/HomeLink";
import { friendlyError } from "@/lib/errors";
import { postAi } from "@/lib/ai-request";
import { stillWorkingNote, useSecondsSince } from "@/lib/ai-jobs";
import SearchBox from "@/components/SearchBox";
import { askConfirm } from "@/components/ConfirmDialog";
import { Ico, type Tone } from "@/components/Icon";
import { SetupNotice } from "@/components/ReadingLibrary";
import {
  compileReport,
  hasNotes,
  isMissingTable,
  loadSources,
  pictureUrl,
  sourceKey,
  sourcesSection,
  type Report,
  type ReportSource,
  type SourceKind,
  type SourceSection,
} from "@/lib/report";
import { copyReport } from "@/lib/report-export";
import DownloadMenu from "@/components/DownloadMenu";
import { pageToPng } from "@/lib/handwriting-image";
import { DRAFT_STYLES, draftStyle, type DraftStyle } from "@/lib/report-styles";
import { createClient } from "@/lib/supabase/client";
import { ReportIcon } from "@/components/ReportWriterLink";
import { Tour, TourButton, useSectionTour } from "@/components/Tour";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Clapperboard,
  Copy,
  Eye,
  FileText,
  GraduationCap,
  Layers,
  Link2,
  Loader2,
  NotebookPen,
  PenLine,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import ReportRichEditor, { type ImproveHow } from "@/components/ReportRichEditor";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Chosen = { kind: SourceKind; id: string };
type SaveState = "saved" | "saving" | "error";

const UNTITLED = "Untitled report";

const TABS: { key: SourceSection; name: string; Icon: LucideIcon; tone: Tone }[] = [
  { key: "videos", name: "Videos", Icon: Clapperboard, tone: "red" },
  { key: "reading", name: "Reading", Icon: FileText, tone: "blue" },
  { key: "tutorial", name: "Tutorials", Icon: GraduationCap, tone: "green" },
  { key: "scrap", name: "ScrapBook", Icon: NotebookPen, tone: "amber" },
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

// What's in a chosen item, without the handwriting (it has its own button next to it).
function typedSummary(s: ReportSource) {
  const bits: string[] = [];
  if (s.notes.trim()) bits.push("typed notes");
  if (s.clips.length) bits.push(`${s.clips.length} clip${s.clips.length === 1 ? "" : "s"}`);
  return bits.join(", ");
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
  const tour = useSectionTour("report", report !== null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [sources, setSources] = useState<ReportSource[] | null>(null);
  const [sourcesError, setSourcesError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Chosen[]>([]);
  const [picking, setPicking] = useState(false);
  const [tab, setTab] = useState<SourceSection>("videos");
  const [query, setQuery] = useState("");
  const [onlyWithNotes, setOnlyWithNotes] = useState(true);

  const [focus, setFocus] = useState("");
  const [style, setStyle] = useState<DraftStyle>("summary");
  const [aiBusy, setAiBusy] = useState(false);
  // While drafting: when it started, and what it's doing now (like trying another model).
  const [aiStartedAt, setAiStartedAt] = useState(0);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [aiModel, setAiModel] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [titleIdeas, setTitleIdeas] = useState<{ titles: string[]; model: string | null } | null>(null);
  const [titleBusy, setTitleBusy] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  // Text read from handwritten pages, by sourceKey, kept with the report (never in the notes themselves).
  const [handwriting, setHandwriting] = useState<Record<string, string>>({});
  const [handReady, setHandReady] = useState(false);
  const [handReading, setHandReading] = useState<{ key: string; page: number; total: number } | null>(null);
  const [handReview, setHandReview] = useState<{ key: string; text: string; model: string | null; fresh: boolean } | null>(null);
  const [handError, setHandError] = useState<{ key: string; text: string } | null>(null);
  // The read-only share link; the column exists once supabase/report-share.sql is run.
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareReady, setShareReady] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
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
        else setSaveError(friendlyError(error.message));
        return;
      }
      if (!r.data) {
        setMissing(true);
        return;
      }
      const row = r.data as Report;
      setReport(row);
      // A new report starts with an empty title box, so there's nothing to delete first.
      setTitle(row.title === UNTITLED ? "" : row.title);
      setBody(row.body ?? "");
      // The handwriting column exists once supabase/report-handwriting.sql is run.
      setHandReady("handwriting" in row);
      setShareReady("share_token" in row);
      setShareToken(row.share_token ?? null);
      setHandwriting(row.handwriting && typeof row.handwriting === "object" ? row.handwriting : {});
      const list = (rs.data ?? []).map((x) => ({ kind: x.source_kind as SourceKind, id: x.source_id as string }));
      setChosen(list);
      setPicking(list.length === 0);
    })();
    loadSources(supabase)
      .then(setSources)
      .catch((e: Error) => setSourcesError(friendlyError(e.message)));
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
    if (report) lastSaved.current = { title: report.title === UNTITLED ? "" : report.title, body: report.body };
  }, [report]);

  const saveText = useCallback(
    async (nextTitle: string, nextBody: string) => {
      const cleanTitle = nextTitle.trim().slice(0, 200) || UNTITLED;
      setSaveState("saving");
      const { error } = await supabase
        .from("reports")
        .update({ title: cleanTitle, body: nextBody, updated_at: new Date().toISOString() })
        .eq("id", reportId);
      if (!mounted.current) return;
      if (error) {
        setSaveState("error");
        setSaveError(friendlyError(error.message));
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

  // Saves right away if the person leaves the page, switches apps or closes the tab before
  // the pause above is over, so the last words typed are never lost.
  const latest = useRef({ title, body, ready: false });
  latest.current = { title, body, ready: !!report };
  const flushText = useCallback(() => {
    const { title: t, body: b, ready } = latest.current;
    if (!ready || (t === lastSaved.current.title && b === lastSaved.current.body)) return;
    saveText(t, b);
  }, [saveText]);
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flushText();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      flushText();
    };
  }, [flushText]);

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
        if (error && mounted.current) {
          // ScrapBook pages need supabase/report-scrapbook.sql before they can be saved as chosen items.
          notify(
            /source_kind/.test(error.message)
              ? "ScrapBook pages need one setup step: in Supabase, run supabase/report-scrapbook.sql once, then reload."
              : `Couldn't save the chosen items: ${friendlyError(error.message)}`,
            true,
          );
        }
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

  // ---------- Handwriting ----------

  // Only the chosen items' handwriting is sent to the AI.
  function usedHandwriting() {
    return Object.fromEntries(chosen.map(sourceKey).filter((k) => handwriting[k]?.trim()).map((k) => [k, handwriting[k]]));
  }

  // Draws each handwritten page as a picture and has the AI read it, one page at a time.
  // The text is shown for checking; nothing is kept until it's saved.
  async function readHandwriting(s: ReportSource) {
    const key = sourceKey(s);
    setHandError(null);
    setHandReview(null);
    if (!handReady) {
      setHandError({
        key,
        text: "Reading handwriting needs one setup step first. In Supabase, open SQL Editor and run the file supabase/report-handwriting.sql once, then reload this page.",
      });
      return;
    }
    const pages = s.pages.filter((p) => p.strokes?.length);
    if (!pages.length) {
      setHandError({ key, text: "These pages only have pictures or stickers on them, no writing to read." });
      return;
    }
    const texts: string[] = [];
    let model: string | null = null;
    try {
      for (let i = 0; i < pages.length; i++) {
        setHandReading({ key, page: i + 1, total: pages.length });
        const image = pageToPng(pages[i]);
        if (!image) continue;
        const res = await postAi("/api/report-handwriting", { image });
        const data = res.data;
        if (!mounted.current) return;
        if (!res.ok) {
          setHandError({ key, text: data.error ?? `The AI couldn't read page ${i + 1} (error ${res.status}).` });
          return;
        }
        if (data.model) model = String(data.model);
        const text = String(data.text ?? "").trim();
        if (text) texts.push(text);
      }
      if (!mounted.current) return;
      if (!texts.length) setHandError({ key, text: "The AI couldn't find any writing to read on these pages." });
      else setHandReview({ key, text: texts.join("\n\n"), model, fresh: true });
    } catch {
      if (mounted.current) setHandError({ key, text: "Couldn't reach the AI. Check your connection." });
    } finally {
      if (mounted.current) setHandReading(null);
    }
  }

  // Keeps the checked text with this report. Empty text removes it.
  async function saveHandwriting(key: string, text: string) {
    const next = { ...handwriting };
    if (text.trim()) next[key] = text.trim();
    else delete next[key];
    const { error } = await supabase.from("reports").update({ handwriting: next }).eq("id", reportId);
    if (!mounted.current) return;
    if (error) return notify(`Couldn't save the handwriting text: ${friendlyError(error.message)}`, true);
    setHandwriting(next);
    setHandReview(null);
    notify(text.trim() ? "Saved. It's used when you put the report together or draft it with AI." : "Removed the handwriting text.");
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
    if (!chosenSources.length) return notify("Choose at least one video, reading, tutorial or ScrapBook page first.", true);
    if (!(await okToReplace())) return;
    setBody(compileReport(title.trim() || UNTITLED, chosenSources, handwriting));
  }

  async function draftWithAi() {
    if (!chosenSources.length) return notify("Choose at least one video, reading, tutorial or ScrapBook page first.", true);
    if (!(await okToReplace())) return;
    setAiBusy(true);
    setAiError(null);
    setAiNote(null);
    setAiModel(null);
    setAiStartedAt(Date.now());
    const reportTitle = title.trim() || UNTITLED;
    try {
      const res = await postAi(
        "/api/report-ai",
        { title: reportTitle, prompt: focus, style, sources: chosen, handwriting: usedHandwriting() },
        { onNote: (note) => mounted.current && setAiNote(note), onModel: (model) => mounted.current && setAiModel(model) },
      );
      const data = res.data as { text?: string; sources?: Parameters<typeof sourcesSection>[0]; model?: string; error?: string };
      if (!res.ok) {
        const message =
          res.status === 504 ? "Took too long. Try fewer items." : (data.error ?? `The AI couldn't write the report (error ${res.status}).`);
        if (mounted.current) setAiError(message);
        return;
      }
      const draft = `# ${reportTitle}\n\n${String(data.text ?? "").trim()}${sourcesSection(data.sources ?? [])}\n`;
      // Saved straight away, so the draft isn't lost if this page was closed meanwhile.
      await saveText(reportTitle, draft);
      if (mounted.current) {
        setBody(draft);
            notify(data.model ? `Drafted by ${data.model}. Check it against your notes.` : "Draft ready.");
      }
    } catch {
      if (mounted.current) setAiError("Couldn't reach the AI. Check your connection.");
    } finally {
      if (mounted.current) setAiBusy(false);
    }
  }

  // Three AI title ideas to pick from. Nothing changes until one is picked.
  async function suggestTitles() {
    // Always clickable; if there's nothing to go on yet, say so instead of greying the button out.
    if (!chosen.length && !body.trim()) {
      setTitleIdeas(null);
      setTitleError("Choose some notes below first, and the AI will suggest titles from them.");
      return;
    }
    setTitleBusy(true);
    setTitleError(null);
    setTitleIdeas(null);
    try {
      const res = await postAi("/api/report-ai", { mode: "title", sources: chosen, body, handwriting: usedHandwriting() });
      const data = res.data as { titles?: unknown; model?: string; error?: string };
      if (!mounted.current) return;
      if (!res.ok) setTitleError(data.error ?? `The AI couldn't suggest titles (error ${res.status}).`);
      else setTitleIdeas({ titles: Array.isArray(data.titles) ? data.titles : [], model: data.model ? String(data.model) : null });
    } catch {
      if (mounted.current) setTitleError("Couldn't reach the AI. Check your connection.");
    } finally {
      if (mounted.current) setTitleBusy(false);
    }
  }

  function pickTitle(next: string) {
    setTitle(next);
    setTitleIdeas(null);
    // Keep the report's own heading in step when it still shows the old title.
    const oldHeading = `# ${title.trim() || UNTITLED}`;
    if (body.startsWith(oldHeading + "\n")) setBody(`# ${next}` + body.slice(oldHeading.length));
  }

  // Improve in the editor's toolbar: the AI rewrites one part (Shorter, Clearer or Expand).
  // The editor shows the new version and only uses it if Replace is chosen.
  const improvePart = useCallback(
    async (text: string, how: ImproveHow) => {
      const res = await postAi("/api/report-improve", { text, how, report: body }).catch(() => null);
      if (!res) throw new Error("Couldn't reach the AI. Check your connection.");
      const data = res.data;
      if (!res.ok) throw new Error(data.error ?? `The AI couldn't improve it (error ${res.status}).`);
      return { text: String(data.text ?? ""), model: data.model ? String(data.model) : null };
    },
    [body],
  );

  // ---------- Export ----------

  const resolve = useCallback((src: string) => pictureUrl(supabase, src), [supabase]);

  async function copy() {
    try {
      await copyReport(body, resolve);
      notify("Copied. Paste it into Word, Google Docs or an email.");
    } catch {
      notify("Couldn't copy. Select the text and copy it instead.", true);
    }
  }


  // ---------- Sharing ----------

  const shareLink = shareToken ? `${typeof window === "undefined" ? "" : window.location.origin}/r/${shareToken}` : "";

  // Turns the read-only link on. It shows the latest version of the report, until sharing is stopped.
  async function startSharing() {
    if (shareToken) return setShareOpen((o) => !o);
    if (!shareReady) {
      return notify("Sharing needs one setup step: in Supabase, run supabase/report-share.sql once, then reload.", true);
    }
    setShareBusy(true);
    const token = crypto.randomUUID();
    const { error } = await supabase.from("reports").update({ share_token: token }).eq("id", reportId);
    if (!mounted.current) return;
    setShareBusy(false);
    if (error) return notify(`Couldn't turn on the link: ${friendlyError(error.message)}`, true);
    setShareToken(token);
    setShareOpen(true);
  }

  async function stopSharing() {
    const ok = await askConfirm({
      title: "Stop sharing this report?",
      message: "The link stops working, so people who have it can't read the report anymore. You can share it again later with a new link.",
      confirmLabel: "Stop sharing",
    });
    if (!ok) return;
    const { error } = await supabase.from("reports").update({ share_token: null }).eq("id", reportId);
    if (!mounted.current) return;
    if (error) return notify(`Couldn't stop sharing: ${friendlyError(error.message)}`, true);
    setShareToken(null);
    setShareOpen(false);
    notify("Stopped sharing. The old link no longer works.");
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(shareLink);
      notify("Link copied. Anyone with it can read this report.");
    } catch {
      notify("Couldn't copy. Select the link and copy it instead.", true);
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

  return (
    <Shell
      title={<span className="min-w-0 truncate text-lg font-semibold">{title.trim() || UNTITLED}</span>}
      actions={<TourButton onClick={tour.start} />}
    >
      <Tour open={tour.open} steps={tour.steps} onClose={tour.close} />
      {/* The report's title, in its own clearly marked box at the top */}
      <section className="mb-5 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <label htmlFor="report-title" className="mr-auto flex items-center gap-1.5 text-sm font-semibold text-[#2b3b5e]">
            <PenLine size={15} aria-hidden /> Report title
          </label>
          <button
            onClick={suggestTitles}
            disabled={titleBusy}
            aria-busy={titleBusy}
            title="Let AI suggest titles from your chosen notes"
            className={`flex items-center gap-1.5 rounded-md bg-[#f6f3ff] px-2.5 py-1 text-sm font-medium text-[#2b3b5e] ring-1 ring-[#e2d9fb] hover:bg-[#efeaff] ${titleBusy ? "cursor-wait" : ""}`}
          >
            {titleBusy ? <Loader2 size={15} className="animate-spin text-[#7c3aed]" aria-hidden /> : <Ico icon={Sparkles} tone="violet" size={15} />}
            {titleBusy ? "Thinking…" : "Suggest with AI"}
          </button>
        </div>
        <input
          id="report-title"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setTitleError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          autoFocus={!title}
          maxLength={200}
          placeholder="Give your report a title, like “What I learned about transformers”"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xl font-semibold text-slate-900 placeholder:font-normal placeholder:text-slate-400 focus:border-[#7c6bd6] focus:ring-2 focus:ring-[#ece6ff] focus:outline-none"
        />
        {titleBusy && (
          <div className="mt-2 rounded-lg bg-[#f6f3ff] p-2 ring-1 ring-[#e2d9fb]" role="status">
            <p className="mb-1 flex items-center gap-1.5 px-1 text-xs font-medium text-slate-600">
              <Sparkles size={13} className="animate-pulse text-[#7c3aed]" aria-hidden /> Reading your notes and thinking of titles…
            </p>
            <div className="flex flex-col gap-1">
              {[70, 85, 60].map((w) => (
                <div key={w} className="rounded-md bg-white px-3 py-2 ring-1 ring-[#e2d9fb]">
                  <div className="h-3.5 animate-pulse rounded bg-[#e9e3fb]" style={{ width: `${w}%` }} />
                </div>
              ))}
            </div>
          </div>
        )}
        {titleIdeas && (
          <div className="mt-2 rounded-lg bg-[#f6f3ff] p-2 ring-1 ring-[#e2d9fb]">
            <div className="mb-1 flex items-center px-1 text-xs font-medium text-slate-600">
              <span className="mr-auto">
                {titleIdeas.titles.length
                  ? `${titleIdeas.model ? `Ideas from ${titleIdeas.model}. ` : ""}Pick one, or keep typing your own:`
                  : "No ideas came back. Try again."}
              </span>
              <button onClick={() => setTitleIdeas(null)} className="rounded p-0.5 text-slate-400 hover:text-slate-700" aria-label="Close suggestions">
                <X size={14} />
              </button>
            </div>
            <div className="flex flex-col gap-1">
              {titleIdeas.titles.map((idea) => (
                <button
                  key={idea}
                  onClick={() => pickTitle(idea)}
                  className="rounded-md bg-white px-3 py-1.5 text-left text-sm font-medium text-slate-800 ring-1 ring-[#e2d9fb] hover:bg-[#efeaff]"
                >
                  {idea}
                </button>
              ))}
            </div>
          </div>
        )}
        {titleError && <p className="mt-2 text-sm text-red-700">{titleError}</p>}
        <p className="mt-1.5 text-xs text-slate-500">Used at the top of the report and as the Word file&apos;s name. It saves as you type.</p>
      </section>

      {saveError && <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{saveError}</p>}

      {/* 1. Choose */}
      <section data-tour="report-choose" className="mb-5 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
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
              const key = sourceKey(c);
              const handButton = s && s.handPages > 0 && (
                <HandwritingButton
                  pages={s.handPages}
                  read={Boolean(handwriting[key])}
                  progress={handReading?.key === key ? handReading : null}
                  busy={Boolean(handReading)}
                  onRead={() => readHandwriting(s)}
                  onOpen={() => setHandReview(handReview?.key === key ? null : { key, text: handwriting[key], model: null, fresh: false })}
                />
              );
              return (
                <li key={sourceKey(c)} className="rounded-md bg-slate-50 px-2 py-1.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-5 text-right text-slate-400">{i + 1}.</span>
                    {tabInfo && <Ico icon={tabInfo.Icon} tone={tabInfo.tone} />}
                    <span className="min-w-0 flex-1 truncate">
                      {s ? s.title : sources ? <i className="text-slate-500">Removed from your library</i> : "…"}
                    </span>
                    {s && <span className="hidden text-xs text-slate-500 sm:inline">{s.handPages ? typedSummary(s) : notesSummary(s)}</span>}
                    {handButton && <span className="hidden sm:flex">{handButton}</span>}
                    <IconButton label="Move up" onClick={() => move(i, -1)} disabled={i === 0} Icon={ArrowUp} />
                    <IconButton label="Move down" onClick={() => move(i, 1)} disabled={i === chosen.length - 1} Icon={ArrowDown} />
                    <IconButton label="Remove" onClick={() => updateChosen(chosen.filter((_, j) => j !== i))} Icon={X} />
                  </div>
                  {/* On a phone the button gets its own line, so the title stays readable */}
                  {handButton && <div className="mt-1 ml-7 flex sm:hidden">{handButton}</div>}
                  {s && handError?.key === sourceKey(s) && <p className="mt-1.5 ml-7 text-sm text-red-700">{handError.text}</p>}
                  {s && handReview?.key === sourceKey(s) && (
                    <HandwritingReview
                      review={handReview}
                      busy={Boolean(handReading)}
                      onChange={(text) => setHandReview({ ...handReview, text })}
                      onSave={() => saveHandwriting(handReview.key, handReview.text)}
                      onReadAgain={() => readHandwriting(s)}
                      onCancel={() => setHandReview(null)}
                    />
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {picking && (
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <nav className="grid w-full grid-cols-2 rounded-lg bg-slate-100 p-0.5 sm:flex sm:w-auto">
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
              <SearchBox value={query} onChange={setQuery} placeholder="Search titles, categories and notes…" className="min-w-0 flex-1" />
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
      <section data-tour="report-build" className="mb-5 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-3 font-semibold">2. Build the report</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white p-3 pt-4 relative">{/* A thin stripe in the BrainShelf logo's book colours */}
            <span aria-hidden className="absolute inset-x-0 top-0 flex h-1.5"><span className="flex-1 bg-[#dc2626]" /><span className="flex-1 bg-[#16a34a]" /><span className="flex-1 bg-[#2563eb]" /><span className="flex-1 bg-[#f59e0b]" /></span>
            <p className="mb-1 flex items-center gap-1.5 font-medium">
              <Ico icon={Layers} tone="blue" /> Put my notes together
            </p>
            <p className="mb-3 text-sm text-slate-600">Your notes as they are, no AI.</p>
            <button
              onClick={compile}
              disabled={aiBusy}
              className="rounded-md bg-[#2b3b5e] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#22304d] disabled:opacity-60"
            >
              Put together
            </button>
          </div>
          <div className="relative overflow-hidden rounded-lg border border-violet-200 bg-violet-50/40 p-3 pt-4">
            {/* A purple stripe, the colour used for AI throughout Report Writer */}
            <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#c4b5fd] via-[#8b5cf6] to-[#6d28d9]" />
            <p className="mb-1 flex items-center gap-1.5 font-medium">
              <Ico icon={Sparkles} tone="violet" /> Draft with AI
            </p>
            <p className="mb-2 text-sm text-slate-600">AI writes one report from your notes.</p>
            {/* The kind of report to write; one is chosen at a time */}
            <div className="mb-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Kind of report">
              {DRAFT_STYLES.map((st) => (
                <button
                  key={st.key}
                  role="radio"
                  aria-checked={style === st.key}
                  onClick={() => setStyle(st.key)}
                  className={`rounded-full px-2.5 py-0.5 text-sm ${style === st.key ? "bg-violet-600 font-medium text-white" : "bg-white text-slate-700 ring-1 ring-violet-200 hover:bg-violet-50"}`}
                >
                  {st.label}
                </button>
              ))}
            </div>
            <p className="mb-2 text-xs text-slate-500">{draftStyle(style).note}</p>
            <input
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              maxLength={2000}
              placeholder="Optional: anything else it should focus on?"
              aria-label="What the AI draft should focus on"
              className="mb-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
            <button
              onClick={draftWithAi}
              disabled={aiBusy}
              className="flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
            >
              <Sparkles size={14} aria-hidden />
              {aiBusy ? <DraftingLabel startedAt={aiStartedAt} note={aiNote} model={aiModel} /> : draftStyle(style).button}
            </button>
            {aiError && <p className="mt-2 text-sm text-red-700">{aiError}</p>}
          </div>
        </div>
      </section>

      {/* 3. Edit and export */}
      <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div data-tour="report-export" className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="mr-auto font-semibold">3. Edit and export</h2>
          {saveState === "error" ? (
            <button onClick={() => saveText(title, body)} className="text-xs text-red-600 underline">
              Not saved. Tap to retry
            </button>
          ) : (
            <span className="text-xs text-slate-500" title="Your report saves itself as you type">
              {saveState === "saving" ? "Saving…" : "Saved"}
            </span>
          )}
          <button
            onClick={copy}
            disabled={!body.trim()}
            className="flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            <Copy size={14} aria-hidden /> Copy
          </button>
          <button
            onClick={startSharing}
            disabled={shareBusy}
            aria-expanded={shareOpen}
            title={shareToken ? "Show the share link" : "Share a read-only link to this report"}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm disabled:opacity-50 ${shareToken ? "bg-blue-50 font-medium text-blue-700 ring-1 ring-blue-200 hover:bg-blue-100" : "border border-slate-300 hover:bg-slate-50"}`}
          >
            <Ico icon={Link2} tone="blue" size={14} /> {shareToken ? "Shared" : "Share"}
          </button>
          <DownloadMenu
            title={title.trim() || "Report"}
            makeDocument={() => body}
            resolve={resolve}
            disabled={!body.trim()}
            onError={(m) => notify(m, true)}
          />
        </div>

        {shareToken && shareOpen && (
          <div className="mb-3 rounded-lg bg-blue-50/60 p-3 ring-1 ring-blue-100">
            <p className="text-sm font-medium text-[#2b3b5e]">Anyone with this link can read this report. They can&apos;t change it.</p>
            <div className="mt-2 flex gap-2">
              <input
                readOnly
                value={shareLink}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Share link"
                className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-600"
              />
              <button onClick={copyShareLink} className="shrink-0 rounded-md bg-[#2b3b5e] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#22304d]">
                Copy link
              </button>
            </div>
            <div className="mt-2 flex items-center gap-3 text-sm">
              <a href={`/r/${shareToken}?preview=${reportId}`} className="flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-slate-900 hover:bg-blue-100">
                <Eye size={14} aria-hidden className="text-blue-600" /> Preview what they see
              </a>
              <button onClick={stopSharing} className="ml-auto text-slate-600 underline hover:text-slate-900">
                Stop sharing
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              It always shows the latest version, so edits you make here appear for them too. Your notes and the rest of your library stay private.
            </p>
          </div>
        )}

        <ReportRichEditor body={body} onChange={setBody} resolve={resolve} onImprove={improvePart} />
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

function Shell({ title, actions, children }: { title: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-3">
        <HomeLink />
        <Link href="/reports" className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100">
          <ArrowLeft size={16} aria-hidden /> <ReportIcon size={20} /> <span className="font-medium text-slate-800">Report Writer</span>
        </Link>
        {typeof title === "string" ? <span className="text-lg font-semibold">{title}</span> : title}
        {actions && <div className="ml-auto shrink-0">{actions}</div>}
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}

// Next to a chosen item with handwritten pages: read them with AI, or open the text already read.
function HandwritingButton({
  pages,
  read,
  progress,
  busy,
  onRead,
  onOpen,
}: {
  pages: number;
  read: boolean;
  progress: { page: number; total: number } | null;
  busy: boolean;
  onRead: () => void;
  onOpen: () => void;
}) {
  const base = "flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1";
  if (progress) {
    return (
      <span className={`${base} bg-[#f6f3ff] text-[#2b3b5e] ring-[#e2d9fb]`} role="status">
        <Loader2 size={13} className="animate-spin text-[#7c3aed]" aria-hidden /> Reading page {progress.page} of {progress.total}…
      </span>
    );
  }
  if (read) {
    return (
      <button onClick={onOpen} title="See or fix the text read from your handwriting" className={`${base} bg-white text-green-700 ring-green-200 hover:bg-green-50`}>
        <Check size={13} aria-hidden /> Handwriting read
      </button>
    );
  }
  return (
    <button
      onClick={onRead}
      disabled={busy}
      title={`Let AI read your ${pages} handwritten page${pages === 1 ? "" : "s"}, so the writing can go in the report`}
      className={`${base} bg-[#f6f3ff] text-[#2b3b5e] ring-[#e2d9fb] hover:bg-[#efeaff] disabled:opacity-50`}
    >
      <Ico icon={Sparkles} tone="violet" size={13} /> Read handwriting ({pages})
    </button>
  );
}

// The text read from the handwriting, to check and fix before it's used.
function HandwritingReview({
  review,
  busy,
  onChange,
  onSave,
  onReadAgain,
  onCancel,
}: {
  review: { text: string; model: string | null; fresh: boolean };
  busy: boolean;
  onChange: (text: string) => void;
  onSave: () => void;
  onReadAgain: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-2 ml-7 rounded-lg bg-[#f6f3ff] p-2 ring-1 ring-[#e2d9fb]">
      <p className="mb-1 px-1 text-xs font-medium text-slate-600">
        {review.fresh
          ? `${review.model ? `Read by ${review.model}. ` : ""}Check it against your page and fix anything it got wrong. [?] marks words it couldn't read.`
          : "The text read from your handwriting. Edit it here; your handwritten page stays as it is."}
      </p>
      <textarea
        value={review.text}
        onChange={(e) => onChange(e.target.value)}
        rows={Math.min(14, Math.max(4, review.text.split("\n").length + 1))}
        aria-label="Text read from your handwriting"
        className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm leading-relaxed"
      />
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <button onClick={onSave} className="rounded-md bg-[#2b3b5e] px-3 py-1 text-sm font-medium text-white hover:bg-[#22304d]">
          {review.fresh ? "Use this text" : "Save changes"}
        </button>
        <button onClick={onCancel} className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm hover:bg-slate-50">
          Cancel
        </button>
        <button
          onClick={onReadAgain}
          disabled={busy}
          className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-sm text-[#2b3b5e] hover:bg-[#efeaff] disabled:opacity-50"
        >
          <Sparkles size={13} className="text-[#7c3aed]" aria-hidden /> Read again
        </button>
      </div>
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

// The Draft button's words while the AI writes. After 2.5 minutes, or when another model is
// being tried, it says so, so it doesn't look stuck.
function DraftingLabel({ startedAt, note, model }: { startedAt: number; note: string | null; model: string | null }) {
  const seconds = useSecondsSince(startedAt);
  return (
    <>
      {stillWorkingNote(seconds, note ?? undefined) ?? "Writing… (up to a minute or two)"}
      {model && ` · ${model} · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}
    </>
  );
}
