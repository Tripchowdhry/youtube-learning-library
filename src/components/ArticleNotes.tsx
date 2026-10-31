"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { askConfirm } from "@/components/ConfirmDialog";
import { onAiJobDone, runAiJob, useAiJobs, useSecondsSince } from "@/lib/ai-jobs";
import { createClient } from "@/lib/supabase/client";
import type { Article } from "@/lib/types";
import { askArticleAi } from "@/lib/video-ai";

type SaveState = "saved" | "saving" | "unsaved" | "error";

const MISSING_COLUMN =
  "Notes can't be saved yet. In Supabase, open SQL Editor and run the file supabase/article-notes.sql once, then reload.";

// Adds an AI answer to the end of the notes.
function addAnswer(notes: string, answer: string) {
  const current = notes.trimEnd();
  return `${current ? `${current}\n\n` : ""}${answer}`;
}

const presets = (word: string) => [
  { label: "📝 Summary in 100 words", prompt: `Summarize this ${word} in 100 words.` },
  { label: "💡 Key ideas", prompt: `List the key ideas in this ${word}, one line each.` },
  { label: "🪜 How to use it in 3 steps", prompt: `Explain in 3 steps how to use what this ${word} teaches.` },
  { label: "• Report in bullets", prompt: `Write a report on this ${word} in bullet points.` },
  { label: "❓ Quiz me", prompt: `Write 5 short questions to test what I learned from this ${word}, with the answers at the end.` },
];

// The notes side of the reading page: Ask AI about the article, and a box for typed notes.
export default function ArticleNotes(props: {
  article: Article;
  onNotesChange: (notes: string) => void;
  onClose: () => void;
}) {
  const { article } = props;
  const supabase = useState(() => createClient())[0];
  const word = article.kind === "tutorial" ? "tutorial" : "article";
  const [notes, setNotes] = useState(article.notes ?? "");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);

  const aiJobs = useAiJobs();
  const aiKey = `article-ask:${article.id}`;
  const aiStartedAt = aiJobs.running.find((j) => j.key === aiKey)?.startedAt ?? null;
  const aiError = aiJobs.errors.get(aiKey) ?? null;

  // ---------- Saving ----------

  const notesRef = useRef(notes);
  notesRef.current = notes;
  const { onNotesChange } = props;

  const save = useCallback(async () => {
    setSaveState("saving");
    const text = notesRef.current;
    const { error } = await supabase.from("articles").update({ notes: text }).eq("id", article.id);
    if (error) {
      setSaveState("error");
      setSaveError(/notes/.test(error.message) ? MISSING_COLUMN : error.message);
    } else {
      setSaveState(notesRef.current === text ? "saved" : "unsaved");
      setSaveError(null);
      onNotesChange(text);
    }
  }, [supabase, article.id, onNotesChange]);

  useEffect(() => {
    if (saveState !== "unsaved") return;
    const timer = setTimeout(save, 1200);
    return () => clearTimeout(timer);
  }, [notes, saveState, save]);

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
    setNotes(text);
    setSaveState("unsaved");
  }

  // ---------- Ask AI ----------

  // The answer goes to the end of the notes. The AI keeps working if the person leaves
  // this page; the answer is then saved to the notes for them.
  function askAi(prompt: string) {
    if (aiStartedAt !== null) return;
    runAiJob<string>({
      key: aiKey,
      label: `AI answer for "${article.title ?? article.site ?? `your ${word}`}"`,
      work: async () => {
        const result = await askArticleAi({ url: article.url, title: article.title, kind: word, task: "ask", prompt });
        if (result.error || !result.text) return { error: result.error ?? "The AI didn't answer." };
        const by = result.model ? ` (${result.model})` : "";
        return { result: `✨ ${prompt}${by}\n${result.text}\n` };
      },
      fallback: async (answer) => {
        const { data } = await supabase.from("articles").select("notes").eq("id", article.id).maybeSingle();
        const { error } = await supabase
          .from("articles")
          .update({ notes: addAnswer((data?.notes ?? "") as string, answer) })
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
        setNotes(addAnswer(notesRef.current, answer as string));
        setSaveState("unsaved");
        requestAnimationFrame(() => {
          if (box.current) box.current.scrollTop = box.current.scrollHeight;
        });
        return true;
      }),
    [article.id],
  );

  // Keep the drawn text lined up after the box is resized or text is added.
  useEffect(() => {
    if (box.current && backdrop.current) backdrop.current.scrollTop = box.current.scrollTop;
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold">📒 My notes</h2>
        {saveState === "error" ? (
          <button onClick={save} className="text-xs text-red-600 underline">
            Not saved. Tap to retry
          </button>
        ) : (
          <span className="text-xs text-slate-500">{saveState === "saved" ? "Saved" : "Saving…"}</span>
        )}
        <span className="ml-auto flex gap-1">
          {notes.trim() && (
            <button
              onClick={async () => {
                const ok = await askConfirm({
                  title: "Clear your notes?",
                  message: `All the typed notes for this ${word} will be erased. The ${word} stays in your list.`,
                  confirmLabel: "Yes, clear notes",
                  cancelLabel: "Keep them",
                  danger: true,
                });
                if (ok) change("");
              }}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
            >
              🧹 Clear
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
      {saveError && <p className="rounded-md bg-red-50 px-2 py-1.5 text-sm text-red-700 ring-1 ring-red-200">⚠️ {saveError}</p>}

      <AskAi word={word} startedAt={aiStartedAt} error={aiError} onAsk={askAi} />

      <div className="relative rounded-lg bg-white shadow-sm ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-slate-400">
        {/* The text is drawn here, behind the (see-through) typing box, so AI prompts can be shown in bold. */}
        <div ref={backdrop} aria-hidden className="notes-text notes-backdrop">
          {notes.split("\n").map((line, i) => (
            <Fragment key={i}>
              {i > 0 && "\n"}
              {line.startsWith("✨") ? <span className="notes-prompt">{line}</span> : line}
            </Fragment>
          ))}{" "}
        </div>
        <textarea
          ref={box}
          value={notes}
          onChange={(e) => change(e.target.value)}
          onScroll={(e) => {
            if (backdrop.current) backdrop.current.scrollTop = e.currentTarget.scrollTop;
          }}
          placeholder={`Type your notes here…\n\nTip: ask the AI above for a summary or key ideas. The answer lands here, and you can edit it like your own notes.`}
          className="notes-text notes-input"
        />
      </div>
    </div>
  );
}

function AskAi(props: { word: string; startedAt: number | null; error: string | null; onAsk: (prompt: string) => void }) {
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
      <p className="text-sm font-semibold">✨ Ask AI about this {props.word}</p>
      <div className="mt-2 flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          {presets(props.word).map((p) => (
            <button
              key={p.label}
              onClick={() => ask(p.prompt)}
              disabled={busy}
              className="rounded-full bg-violet-50 px-3 py-1 text-xs text-violet-800 ring-1 ring-violet-200 hover:bg-violet-100 disabled:opacity-50"
            >
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
        {props.startedAt !== null && <Working startedAt={props.startedAt} word={props.word} />}
        {props.error && (
          <p className="rounded-md bg-red-50 px-2 py-1.5 text-sm text-red-700 ring-1 ring-red-200">⚠️ {props.error}</p>
        )}
      </div>
    </div>
  );
}

// Counts the seconds while the AI works, so it's clear nothing is stuck.
function Working({ startedAt, word }: { startedAt: number; word: string }) {
  const s = useSecondsSince(startedAt);
  return (
    <p className="rounded-md bg-violet-50 px-2 py-1.5 text-sm text-violet-800 ring-1 ring-violet-200">
      <span className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-300 border-t-violet-700 align-[-2px]" />
      The AI is reading the {word} ({Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}). You can leave this page; the
      answer is still added to your notes.
    </p>
  );
}
