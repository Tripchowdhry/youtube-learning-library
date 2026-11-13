"use client";

import StopAiButton from "@/components/StopAiButton";
import { useCallback, useEffect, useRef, useState } from "react";
import { askConfirm } from "@/components/ConfirmDialog";
import { onAiJobDone, runAiJob, useAiJobs, useSecondsSince } from "@/lib/ai-jobs";
import { createClient } from "@/lib/supabase/client";
import type { Article, NotePage } from "@/lib/types";
import { askArticleAi } from "@/lib/video-ai";
import {
  Brush,
  CircleHelp,
  FileText,
  Footprints,
  Keyboard,
  Lightbulb,
  List,
  NotebookText,
  PenLine,
  Sparkles,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { Ico, type Tone } from "@/components/Icon";
import { ClipButton, DeleteClipButton } from "@/components/ClipButtons";
import { clipUrl, joinTypedClips, splitTypedClips, type ClipImage, type TypedClip } from "@/lib/clips";
import { HandwritingPad, withPicture } from "@/components/Handwriting";
import { hasWriting, openingMode, type NoteMode } from "@/lib/note-mode";
import ReportRichEditor, { type RichEditorHandle } from "@/components/ReportRichEditor";
import NotesExport from "@/components/NotesExport";
import { answerHeading, boldPrompts, notesDocument } from "@/lib/notes-format";
import { pictureUrl } from "@/lib/report";

type SaveState = "saved" | "saving" | "unsaved" | "error";

const MISSING_COLUMN =
  "Notes can't be saved yet. In Supabase, open SQL Editor and run the file supabase/article-notes.sql once, then reload.";
const PAGES_SETUP =
  "Handwriting can't be saved yet. In Supabase, open SQL Editor and run the file supabase/article-pages.sql once, then reload.";
const MODE_KEY = "reading-notes-mode";

// Adds an AI answer to the end of the typed notes (the text, not the clips saved after it).
function addAnswer(notes: string, answer: string) {
  const current = notes.trimEnd();
  return `${current ? `${current}\n\n` : ""}${answer}`;
}

function addAnswerToSaved(saved: string, answer: string) {
  const { text, clips } = splitTypedClips(saved);
  return joinTypedClips(addAnswer(text, answer), clips);
}

const presets = (word: string): { label: string; icon: LucideIcon; tone: Tone; prompt: string }[] => [
  {
    label: "Summary in 100 words",
    icon: FileText,
    tone: "sky",
    prompt: `Summarize this ${word} in 100 words.`,
  },
  {
    label: "Key ideas",
    icon: Lightbulb,
    tone: "yellow",
    prompt: `List the key ideas in this ${word}, one line each.`,
  },
  {
    label: "How to use it in 3 steps",
    icon: Footprints,
    tone: "green",
    prompt: `Explain in 3 steps how to use what this ${word} teaches.`,
  },
  {
    label: "Report in bullets",
    icon: List,
    tone: "slate",
    prompt: `Write a report on this ${word} in bullet points.`,
  },
  {
    label: "Quiz me",
    icon: CircleHelp,
    tone: "red",
    prompt: `Write 5 short questions to test what I learned from this ${word}, with the answers at the end.`,
  },
];

// The notes side of the reading page: Ask AI about the article, and typed or handwritten notes.
export default function ArticleNotes(props: {
  article: Article;
  onNotesChange: (changes: { notes: string; pages?: NotePage[] }) => void;
  onClose: () => void;
}) {
  const { article } = props;
  const supabase = useState(() => createClient())[0];
  const word = article.kind === "tutorial" ? "tutorial" : "article";
  // The typed text and the clips (screenshots) are kept apart here and saved together.
  const [notes, setNotes] = useState(() => boldPrompts(splitTypedClips(article.notes ?? "").text));
  const [clips, setClips] = useState<TypedClip[]>(() => splitTypedClips(article.notes ?? "").clips);
  // Handwriting sheets; the column holding them exists once supabase/article-pages.sql is run.
  const pagesReady = "pages" in article;
  const [pages, setPages] = useState<NotePage[]>(() => article.pages ?? []);
  // Opens the side that holds the notes, like Videos and ScrapBook.
  const [mode, setMode] = useState<NoteMode>(() =>
    openingMode(
      MODE_KEY,
      !!splitTypedClips(article.notes ?? "").text.trim() || splitTypedClips(article.notes ?? "").clips.length > 0,
      hasWriting(article.pages),
    ),
  );
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const box = useRef<RichEditorHandle>(null);
  const resolve = useCallback((src: string) => pictureUrl(supabase, src), [supabase]);

  const aiJobs = useAiJobs();
  const aiKey = `article-ask:${article.id}`;
  const aiStartedAt = aiJobs.running.find((j) => j.key === aiKey)?.startedAt ?? null;
  const aiError = aiJobs.errors.get(aiKey) ?? null;

  // ---------- Saving ----------

  const notesRef = useRef(notes);
  notesRef.current = notes;
  const clipsRef = useRef(clips);
  clipsRef.current = clips;
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  // Counts changes, so a save can tell whether more came in while it ran.
  const revision = useRef(0);
  const { onNotesChange } = props;

  const save = useCallback(async () => {
    setSaveState("saving");
    const started = revision.current;
    const text = joinTypedClips(notesRef.current, clipsRef.current);
    const sheets = pagesRef.current;
    const { error } = await supabase
      .from("articles")
      .update(pagesReady ? { notes: text, pages: sheets } : { notes: text })
      .eq("id", article.id);
    if (error) {
      setSaveState("error");
      setSaveError(/pages/.test(error.message) ? PAGES_SETUP : /notes/.test(error.message) ? MISSING_COLUMN : error.message);
    } else {
      setSaveState(revision.current === started ? "saved" : "unsaved");
      setSaveError(null);
      onNotesChange(pagesReady ? { notes: text, pages: sheets } : { notes: text });
    }
  }, [supabase, article.id, onNotesChange, pagesReady]);

  useEffect(() => {
    if (saveState !== "unsaved") return;
    const timer = setTimeout(save, 1200);
    return () => clearTimeout(timer);
  }, [notes, clips, pages, saveState, save]);

  // Save right away when the notes are closed or the person leaves for another page.
  const saveStateRef = useRef(saveState);
  saveStateRef.current = saveState;
  useEffect(
    () => () => {
      if (saveStateRef.current === "unsaved") save();
    },
    [save],
  );

  // ...or switches apps or closes the tab.
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === "hidden" && saveStateRef.current === "unsaved") save();
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, [save]);

  function change(text: string) {
    revision.current += 1;
    setNotes(text);
    setSaveState("unsaved");
  }

  function changeClips(next: TypedClip[]) {
    revision.current += 1;
    setClips(next);
    setSaveState("unsaved");
  }

  function changePages(next: NotePage[]) {
    revision.current += 1;
    setPages(next);
    setSaveState("unsaved");
  }

  // In Handwriting the picture goes on the sheet; in Typing it joins the typed notes.
  const addClip = useCallback(
    (image: ClipImage, path: string) => {
      revision.current += 1;
      if (modeRef.current === "write" && pagesReady) setPages((p) => withPicture(p, image, path));
      else setClips((c) => [...c, { path, t: null }]);
      setSaveState("unsaved");
    },
    [pagesReady],
  );

  function chooseMode(next: NoteMode) {
    setMode(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      // Storage can be blocked (private browsing); the choice just isn't remembered.
    }
  }

  // ---------- Ask AI ----------

  // The answer goes to the end of the notes. The AI keeps working if the person leaves
  // this page; the answer is then saved to the notes for them.
  function askAi(prompt: string) {
    if (aiStartedAt !== null) return;
    // The answer is typed text, so show the typed notes where it lands.
    setMode("type");
    runAiJob<string>({
      key: aiKey,
      label: `AI answer for "${article.title ?? article.site ?? `your ${word}`}"`,
      work: async (signal) => {
        const result = await askArticleAi(
          {
            url: article.url,
            title: article.title,
            kind: word,
            task: "ask",
            prompt,
          },
          signal,
        );
        if (result.error || !result.text) return { error: result.error ?? "The AI didn't answer." };
        return {
          result: `${answerHeading(prompt, result.model)}\n${result.text}\n`,
        };
      },
      fallback: async (answer) => {
        const { data } = await supabase.from("articles").select("notes").eq("id", article.id).maybeSingle();
        const { error } = await supabase
          .from("articles")
          .update({
            notes: addAnswerToSaved((data?.notes ?? "") as string, answer),
          })
          .eq("id", article.id);
        if (error) throw error;
      },
    });
  }

  // An answer that arrives while this page is open goes straight into the notes box.
  useEffect(
    () =>
      onAiJobDone((key, answer) => {
        if (key !== `article-ask:${article.id}`) return false;
        revision.current += 1;
        setNotes(addAnswer(notesRef.current, answer as string));
        setSaveState("unsaved");
        requestAnimationFrame(() => box.current?.scrollToEnd());
        return true;
      }),
    [article.id],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="flex items-center gap-1.5 font-semibold">
          <Ico icon={NotebookText} tone="amber" />
          My notes
        </h2>
        <span className="ml-auto flex items-center gap-1">
          <ClipButton what={word} onPicture={addClip} compact />
          {mode === "type" && notes.trim() && (
            <button
              onClick={async () => {
                const ok = await askConfirm({
                  title: "Clear all your notes?",
                  message: `All the typed notes for this ${word} will be erased. The ${word} stays in your list.`,
                  confirmLabel: "Yes, clear notes",
                  cancelLabel: "Keep them",
                  danger: true,
                });
                if (ok) change("");
              }}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
            >
              <Ico icon={Brush} tone="orange" size={14} />
              Clear my notes
            </button>
          )}
          <button
            onClick={props.onClose}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
          >
            Hide notes
          </button>
        </span>
      </div>
      {saveError && (
        <p className="flex items-center gap-1.5 rounded-md bg-red-50 px-2 py-1.5 text-sm text-red-700 ring-1 ring-red-200">
          <Ico icon={TriangleAlert} tone="red" size={15} />
          {saveError}
        </p>
      )}

      <AskAi jobKey={aiKey} word={word} startedAt={aiStartedAt} error={aiError} onAsk={askAi} />

      <div className="flex items-center gap-2">
        <div className="flex overflow-hidden rounded-lg bg-slate-100 p-0.5">
          {(
            [
              ["type", "Typing", Keyboard],
              ["write", "Handwriting", PenLine],
            ] as const
          ).map(([id, label, icon]) => (
            <button
              key={id}
              onClick={() => chooseMode(id)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-sm ${mode === id ? "bg-white font-semibold shadow-sm" : "text-slate-600"}`}
            >
              <Ico icon={icon} tone={id === "write" ? "indigo" : "slate"} size={15} />
              {label}
            </button>
          ))}
        </div>
        {mode === "write" && pagesReady && (
          <span className="ml-auto text-xs text-slate-500" title="Your handwriting saves itself as you write">
            {saveState === "error" ? "Not saved" : saveState === "saved" ? "Saved" : "Saving…"}
          </span>
        )}
      </div>

      {mode === "write" ? (
        pagesReady ? (
          <HandwritingPad pages={pages} onChange={changePages} imageUrl={(path) => clipUrl(supabase, path)} />
        ) : (
          <p className="flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-sm text-amber-900 ring-1 ring-amber-200">
            <Ico icon={TriangleAlert} tone="amber" size={15} />
            {PAGES_SETUP}
          </p>
        )
      ) : (
        <>
          {clips.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {clips.map((c, i) => (
                <div key={`${c.path}-${i}`} className="relative w-48 shrink-0 overflow-hidden rounded-md bg-white ring-1 ring-slate-200">
                  <a href={clipUrl(supabase, c.path)} target="_blank" rel="noreferrer" title="Open full size">
                    <img src={clipUrl(supabase, c.path)} alt={`Picture from the ${word}`} className="block w-full" />
                  </a>
                  <DeleteClipButton
                    onClick={async () => {
                      const ok = await askConfirm({
                        title: "Delete this picture?",
                        message: "It will be removed from your notes.",
                        confirmLabel: "Yes, delete",
                        cancelLabel: "Keep it",
                        danger: true,
                      });
                      if (ok) changeClips(clipsRef.current.filter((_, j) => j !== i));
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end">
            <NotesExport
              saveState={saveState}
              onRetry={save}
              title={article.title || article.site || `Notes on this ${word}`}
              makeDocument={() => notesDocument(article.title || article.site || `Notes on this ${word}`, article.url, notes, clips)}
              resolve={resolve}
              empty={!notes.trim() && !clips.length}
            />
          </div>
          <div className="rounded-lg bg-white shadow-sm">
            <ReportRichEditor
              body={notes}
              onChange={change}
              resolve={resolve}
              handle={box}
              label="My notes"
              placeholder="Type your notes here. Ask the AI above for a summary or key ideas; the answer lands here, ready to edit."
              boxClassName="h-[60vh] min-h-48 resize-y overflow-y-auto"
            />
          </div>
        </>
      )}
    </div>
  );
}

function AskAi(props: { jobKey: string; word: string; startedAt: number | null; error: string | null; onAsk: (prompt: string) => void }) {
  const [prompt, setPrompt] = useState("");
  const busy = props.startedAt !== null;
  function ask(text: string) {
    const clean = text.trim();
    if (!clean || busy) return;
    props.onAsk(clean);
    setPrompt("");
  }
  return (
    <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-violet-200">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <Ico icon={Sparkles} tone="yellow" />
        Ask AI about this {props.word}
      </p>
      <div className="mt-2 flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          {presets(props.word).map((p) => (
            <button
              key={p.label}
              onClick={() => ask(p.prompt)}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-3 py-1 text-xs text-violet-800 ring-1 ring-violet-200 hover:bg-violet-100 disabled:opacity-50"
            >
              <Ico icon={p.icon} tone={p.tone} size={14} />
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <textarea
            value={prompt}
            rows={2}
            maxLength={2000}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(prompt);
              }
            }}
            placeholder="Ask anything, e.g. “What are the main arguments?”"
            className="min-w-0 flex-1 resize-y rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          <button
            onClick={() => ask(prompt)}
            disabled={busy || !prompt.trim()}
            className="self-start rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            Ask
          </button>
        </div>
        {props.startedAt !== null && <Working startedAt={props.startedAt} word={props.word} jobKey={props.jobKey} />}
        {props.error && (
          <p className="flex items-center gap-1.5 rounded-md bg-red-50 px-2 py-1.5 text-sm text-red-700 ring-1 ring-red-200">
            <Ico icon={TriangleAlert} tone="red" size={15} />
            {props.error}
          </p>
        )}
      </div>
    </div>
  );
}

// Counts the seconds while the AI works, so it's clear nothing is stuck.
function Working({ startedAt, word, jobKey }: { startedAt: number; word: string; jobKey: string }) {
  const s = useSecondsSince(startedAt);
  return (
    <div className="flex items-start gap-2 rounded-md bg-violet-50 px-2 py-1.5 text-sm text-violet-800 ring-1 ring-violet-200">
      <p className="min-w-0 flex-1">
        <span className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-300 border-t-violet-700 align-[-2px]" />
        The AI is reading the {word} ({Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}). You can leave this page; the answer is still
        added to your notes.
      </p>
      <StopAiButton jobKey={jobKey} />
    </div>
  );
}
