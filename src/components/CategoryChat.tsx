"use client";

// Ask this category: a calm, full-screen chat that answers from the items in one category and
// shows where each part of the answer came from. Video sources jump to the moment cited.
// Each question is one request to the free Gemini AI.

import { ArrowLeft, Check, CircleHelp, Compass, Copy, FilePen, Loader2, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ReportIcon } from "@/components/ReportWriterLink";
import { Ico } from "@/components/Icon";
import {
  MAX_ITEMS,
  MAX_WATCHED_VIDEOS,
  answerAsHtml,
  answerAsReport,
  answerAsText,
  citedSources,
  parseLine,
  sourceHref,
  type ChatItemKind,
  type ChatSource,
} from "@/lib/category-chat";
import { postAi } from "@/lib/ai-request";
import { stillWorkingNote, useSecondsSince } from "@/lib/ai-jobs";
import { friendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";
import { formatTime } from "@/lib/youtube-player";

const PURPLE = "#7c3aed";

type Turn = { q: string; a?: string; sources?: ChatSource[]; error?: string };

const WORDS: Record<ChatItemKind, { one: string; many: string; first: string }> = {
  video: { one: "video", many: "videos", first: "What should I watch first?" },
  article: { one: "item", many: "items", first: "What should I read first?" },
  scrap: { one: "page", many: "pages", first: "What are the big ideas here?" },
};

export default function CategoryChat({
  kind,
  categoryName,
  items,
  onClose,
}: {
  kind: ChatItemKind;
  categoryName: string;
  items: { id: string; title: string }[];
  onClose: () => void;
}) {
  const words = WORDS[kind];
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(items.slice(0, MAX_ITEMS).map((i) => i.id)));
  const [choosing, setChoosing] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  // While asking: when it started, and what it's doing now (like trying another model).
  const [askedAt, setAskedAt] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !choosing) onClose();
    };
    window.addEventListener("keydown", onKey);
    // The page behind doesn't scroll while the chat is open.
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = before;
      abort.current?.abort();
    };
  }, [onClose, choosing]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  const picked = items.filter((i) => chosen.has(i.id));

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    if (!picked.length) {
      setChoosing(true);
      return;
    }
    setDraft("");
    setBusy(true);
    setNote(null);
    setAskedAt(Date.now());
    const history = turns.filter((t) => t.a).map((t) => ({ q: t.q, a: t.a! }));
    setTurns((all) => [...all, { q }]);
    const controller = new AbortController();
    abort.current = controller;
    let result: Turn = { q };
    try {
      const res = await postAi(
        "/api/category-ai",
        { kind, ids: picked.map((i) => i.id), category: categoryName, question: q, history },
        { signal: controller.signal, onNote: setNote },
      );
      const data = res.data as { text?: string; sources?: ChatSource[]; error?: string };
      if (res.ok) result = { q, a: data.text ?? "", sources: data.sources };
      else if (res.status === 504) result = { q, error: "The AI took too long. Tap Choose… and pick fewer items, then try again." };
      else result = { q, error: data.error ?? `The AI couldn't answer (error ${res.status}).` };
    } catch {
      if (controller.signal.aborted) return;
      result = { q, error: "The AI couldn't be reached. Check your connection and try again." };
    }
    setTurns((all) => [...all.slice(0, -1), result]);
    setBusy(false);
  }

  const starters = [
    { icon: Sparkles, tone: "violet" as const, label: "Summarise everything here", prompt: `Summarise everything in this category in a short overview. Group the main ideas.` },
    { icon: CircleHelp, tone: "green" as const, label: "Quiz me on this category", prompt: "Quiz me: ask me 5 short questions on this category, then give the answers with their sources." },
    { icon: Compass, tone: "amber" as const, label: words.first, prompt: `${words.first} Suggest an order for a beginner, with one line on why for each.` },
  ];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-50" role="dialog" aria-modal="true" aria-label={`Ask ${categoryName}`}>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 pt-4 pb-6 md:pt-6">
          <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900">
            <ArrowLeft size={15} aria-hidden /> {categoryName}
          </button>
          <div className="mt-2 flex items-center gap-2">
            <Sparkles size={20} color={PURPLE} aria-hidden />
            <h1 className="mr-auto min-w-0 truncate text-xl font-bold md:text-2xl">Ask {categoryName}</h1>
            {turns.length > 0 && !busy && (
              <button onClick={() => setTurns([])} className="hidden rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100 sm:block">
                New chat
              </button>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
            <span>
              Answers only from <b className="text-slate-900">{picked.length} {picked.length === 1 ? words.one : words.many}</b>
            </span>
            <button onClick={() => setChoosing(true)} className="ml-auto font-medium text-[#7c3aed] hover:underline">
              Choose…
            </button>
          </div>

          {turns.length === 0 ? (
            <div className="pt-8 text-center md:pt-12">
              <span className="inline-flex size-12 items-center justify-center rounded-xl bg-[#f5f3ff]">
                <Sparkles size={24} color={PURPLE} aria-hidden />
              </span>
              <h2 className="mt-3 text-xl font-bold">What do you want to know?</h2>
              <p className="mt-1 text-slate-500">Answers come only from this category, and show where each part came from.</p>
              <div className="mx-auto mt-6 grid max-w-md gap-2 text-left">
                {starters.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => ask(s.prompt)}
                    disabled={busy}
                    className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3.5 py-3 text-sm hover:border-[#c4b5fd] hover:bg-[#faf5ff]"
                  >
                    <Ico icon={s.icon} tone={s.tone} size={16} />
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {turns.map((t, i) => (
                <div key={i} className="space-y-3">
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-slate-900 px-3.5 py-2 text-[15px] leading-snug whitespace-pre-wrap text-white">{t.q}</div>
                  </div>
                  {t.a !== undefined ? (
                    <Answer question={t.q} answer={t.a} sources={t.sources ?? []} />
                  ) : t.error ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{t.error}</div>
                  ) : (
                    <Thinking
                      startedAt={askedAt}
                      note={note}
                      words={kind === "video" ? "Watching your videos and writing an answer…" : "Reading this category and writing an answer…"}
                    />
                  )}
                </div>
              ))}
              <div ref={bottom} />
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-slate-200/70 bg-slate-50 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <form
          className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-xl border-[1.5px] border-[#c4b5fd] bg-white py-1.5 pr-1.5 pl-3.5 shadow-[0_4px_14px_#7c3aed14]"
          onSubmit={(e) => {
            e.preventDefault();
            ask(draft);
          }}
        >
          <textarea
            ref={box}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(draft);
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder={turns.length ? "Ask a follow-up…" : `Ask about ${categoryName}…`}
            aria-label="Your question"
            className="max-h-32 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-[15px] outline-none placeholder:text-slate-400"
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            className="rounded-lg bg-[#7c3aed] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6d28d9] disabled:opacity-40"
          >
            {busy ? <Loader2 size={16} className="animate-spin" aria-label="Asking" /> : "Ask"}
          </button>
        </form>
        <p className="mx-auto mt-1.5 w-full max-w-3xl text-xs text-slate-400">Each question uses 1 of your free daily AI questions.</p>
      </div>

      {choosing && (
        <ChooseItems
          kind={kind}
          items={items}
          chosen={chosen}
          onDone={(next) => {
            setChosen(next);
            setChoosing(false);
          }}
        />
      )}
    </div>
  );
}

// The spinner while an answer is written. After 2.5 minutes, or when another model is being
// tried, it says so, so it doesn't look stuck.
function Thinking({ startedAt, note, words }: { startedAt: number; note: string | null; words: string }) {
  const seconds = useSecondsSince(startedAt);
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
      <Loader2 size={15} className="shrink-0 animate-spin" color={PURPLE} aria-hidden />
      {stillWorkingNote(seconds, note ?? undefined) ?? words}
    </div>
  );
}

// One answer: the text with numbered source tags, the list of sources it used, and ways to keep it.
function Answer({ question, answer, sources }: { question: string; answer: string; sources: ChatSource[] }) {
  const cited = useMemo(() => citedSources(answer, sources), [answer, sources]);
  const [lit, setLit] = useState<number | null>(null);
  const lines = answer.split("\n");

  return (
    <div className="rounded-2xl rounded-tl-md border border-slate-200 bg-white px-4 py-3.5 text-[15px] leading-relaxed">
      <div className="space-y-1.5">
        {lines.map((raw, i) => {
          const line = raw.trim();
          if (!line) return null;
          const bullet = line.match(/^[-*•]\s+(.*)$/);
          const step = line.match(/^(\d+)[.)]\s+(.*)$/);
          const body = bullet ? bullet[1] : step ? step[2] : line;
          const content = parseLine(body, sources.length).map((seg, j) =>
            seg.type === "text" ? (
              seg.bold ? <b key={j}>{seg.text}</b> : <span key={j}>{seg.text}</span>
            ) : (
              <button
                key={j}
                onMouseEnter={() => setLit(seg.n)}
                onMouseLeave={() => setLit(null)}
                onClick={() => setLit(seg.n)}
                title={sources[seg.n - 1]?.title}
                className={`mx-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded px-1 align-[1px] text-[11px] font-bold ${lit === seg.n ? "bg-[#7c3aed] text-white" : "bg-[#ede9fe] text-[#6d28d9]"}`}
              >
                {seg.n}
              </button>
            ),
          );
          if (bullet) return <div key={i} className="flex gap-2 pl-1"><span className="text-slate-400">•</span><div>{content}</div></div>;
          if (step) return <div key={i} className="flex gap-2 pl-1"><span className="text-slate-500">{step[1]}.</span><div>{content}</div></div>;
          return <p key={i}>{content}</p>;
        })}
      </div>

      {cited.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-slate-500">FROM YOUR LIBRARY</p>
          {cited.map((s) => (
            <Link
              key={s.n}
              href={sourceHref(s, s.t)}
              target="_blank"
              onMouseEnter={() => setLit(s.n)}
              onMouseLeave={() => setLit(null)}
              className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm ${lit === s.n ? "bg-[#f5f3ff]" : "hover:bg-slate-50"}`}
            >
              <span className="inline-flex size-5 shrink-0 items-center justify-center rounded bg-[#ede9fe] text-[11px] font-bold text-[#6d28d9]">{s.n}</span>
              <span className="min-w-0 flex-1 truncate">{s.title}</span>
              {s.kind === "video" && s.t !== null ? (
                <span className="shrink-0 rounded bg-red-600 px-1.5 py-0.5 font-mono text-xs font-bold text-white">▶ {formatTime(s.t)}</span>
              ) : (
                <span className="shrink-0 text-xs text-blue-600">Open ›</span>
              )}
            </Link>
          ))}
        </div>
      )}

      <KeepButtons question={question} answer={answer} sources={sources} />
    </div>
  );
}

// Save to ScrapBook, Add to report, and Copy.
function KeepButtons({ question, answer, sources }: { question: string; answer: string; sources: ChatSource[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [saved, setSaved] = useState<{ label: string; href: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reports, setReports] = useState<{ id: string; title: string }[] | null>(null);
  const [working, setWorking] = useState(false);

  async function saveToScrapbook() {
    setWorking(true);
    setError(null);
    const { data, error: e } = await supabase
      .from("scraps")
      .insert({ title: question.replace(/\s+/g, " ").slice(0, 200), body: answerAsHtml(question, answer, sources), category_id: null })
      .select("id")
      .single();
    setWorking(false);
    if (e) return setError(friendlyError(e.message));
    setSaved({ label: "Saved to ScrapBook", href: `/scrap/${data.id}` });
  }

  async function openReports() {
    if (reports) return setReports(null);
    setError(null);
    const { data, error: e } = await supabase.from("reports").select("id, title").order("updated_at", { ascending: false }).limit(6);
    if (e) return setError(/does not exist|schema cache|relation/i.test(e.message) ? "Report Writer isn't set up yet." : friendlyError(e.message));
    setReports(data ?? []);
  }

  async function addToReport(id: string | null) {
    setReports(null);
    setWorking(true);
    setError(null);
    const part = answerAsReport(question, answer, sources);
    let reportId = id;
    if (id) {
      const { data, error: e } = await supabase.from("reports").select("body").eq("id", id).single();
      const body = (data?.body as string | undefined)?.trimEnd() ?? "";
      const up = e ?? (await supabase.from("reports").update({ body: body ? `${body}\n\n${part}` : part }).eq("id", id)).error;
      if (up) {
        setWorking(false);
        return setError(friendlyError(up.message));
      }
    } else {
      const { data, error: e } = await supabase
        .from("reports")
        .insert({ title: question.replace(/\s+/g, " ").slice(0, 200), body: part })
        .select("id")
        .single();
      if (e) {
        setWorking(false);
        return setError(friendlyError(e.message));
      }
      reportId = data.id;
    }
    setWorking(false);
    setSaved({ label: "Added to report", href: `/report/${reportId}` });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(answerAsText(answer, sources));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy. Select the text and copy it instead.");
    }
  }

  const btn = "inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-40";
  return (
    <div className="relative mt-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <button onClick={saveToScrapbook} disabled={working} className={btn}>
          <Ico icon={FilePen} tone="amber" size={14} /> Save to ScrapBook
        </button>
        <button onClick={openReports} disabled={working} className={btn} aria-expanded={reports !== null}>
          <ReportIcon size={14} /> Add to report
        </button>
        <button onClick={copy} className={btn} title="Copy" aria-label="Copy">
          {copied ? <Check size={14} className="text-green-600" aria-hidden /> : <Copy size={14} aria-hidden />}
        </button>
        {saved && (
          <Link href={saved.href} target="_blank" className="ml-1 text-xs text-green-700 hover:underline">
            ✓ {saved.label} · Open
          </Link>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
      {reports && (
        <div className="absolute bottom-full left-0 z-10 mb-1 w-64 rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg sm:left-28">
          <p className="px-3 py-1 text-xs text-slate-500">Add to the end of…</p>
          {reports.map((r) => (
            <button key={r.id} onClick={() => addToReport(r.id)} className="block w-full truncate px-3 py-1.5 text-left hover:bg-slate-50">
              {r.title || "Untitled report"}
            </button>
          ))}
          <button onClick={() => addToReport(null)} className="block w-full border-t border-slate-100 px-3 py-1.5 text-left font-medium text-[#7c3aed] hover:bg-[#faf5ff]">
            + New report
          </button>
        </div>
      )}
    </div>
  );
}

// Choose…: which items the answer may use.
function ChooseItems({
  kind,
  items,
  chosen,
  onDone,
}: {
  kind: ChatItemKind;
  items: { id: string; title: string }[];
  chosen: Set<string>;
  onDone: (next: Set<string>) => void;
}) {
  const [next, setNext] = useState(() => new Set(chosen));
  const toggle = (id: string) =>
    setNext((s) => {
      const copy = new Set(s);
      if (copy.has(id)) copy.delete(id);
      else if (copy.size < MAX_ITEMS) copy.add(id);
      return copy;
    });
  const words = WORDS[kind];

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/30 sm:items-center" onClick={() => onDone(next)}>
      <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="mr-auto font-semibold">Answer from…</h2>
          <button onClick={() => setNext(new Set(items.slice(0, MAX_ITEMS).map((i) => i.id)))} className="text-xs text-[#7c3aed] hover:underline">
            All
          </button>
          <button onClick={() => setNext(new Set())} className="text-xs text-slate-500 hover:underline">
            None
          </button>
          <button onClick={() => onDone(next)} aria-label="Close" className="rounded p-1 text-slate-500 hover:bg-slate-100">
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="overflow-y-auto px-2 py-2">
          {items.map((item) => (
            <label key={item.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm hover:bg-slate-50">
              <input type="checkbox" checked={next.has(item.id)} onChange={() => toggle(item.id)} className="size-4 accent-[#7c3aed]" />
              <span className="min-w-0 flex-1 truncate">{item.title}</span>
            </label>
          ))}
        </div>
        <div className="border-t border-slate-100 px-4 py-3">
          {kind === "video" && next.size > MAX_WATCHED_VIDEOS && (
            <p className="mb-2 text-xs text-slate-500">
              The AI watches the first {MAX_WATCHED_VIDEOS} videos. For the others it uses their titles and your notes.
            </p>
          )}
          {items.length > MAX_ITEMS && <p className="mb-2 text-xs text-slate-500">Up to {MAX_ITEMS} at a time.</p>}
          <button
            onClick={() => onDone(next)}
            className="w-full rounded-lg bg-[#7c3aed] py-2 text-sm font-semibold text-white hover:bg-[#6d28d9]"
          >
            Use {next.size} {next.size === 1 ? words.one : words.many}
          </button>
        </div>
      </div>
    </div>
  );
}

// The purple "Ask this category" button at the top of a category, which opens the chat.
export function AskCategoryButton({
  kind,
  categoryName,
  items,
}: {
  kind: ChatItemKind;
  categoryName: string;
  items: { id: string; title: string }[];
}) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        data-tour="ask-category"
        className="inline-flex items-center gap-1.5 rounded-lg bg-[#7c3aed] px-3 py-1.5 text-sm font-semibold text-white shadow-sm ring-4 ring-[#ede9fe] hover:bg-[#6d28d9]"
        title={`Ask one question across everything in ${categoryName}`}
      >
        <Sparkles size={15} aria-hidden /> Ask this category
      </button>
      {open && <CategoryChat kind={kind} categoryName={categoryName} items={items} onClose={() => setOpen(false)} />}
    </>
  );
}
