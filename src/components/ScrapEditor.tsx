"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { compareFolders, useFolderSort } from "@/components/FolderSort";
import NotePageCanvas, { type Tool } from "@/components/NotePageCanvas";
import { formatDate } from "@/components/ReadingLibrary";
import { createClient } from "@/lib/supabase/client";
import type { ArticleCategory, NotePage, NoteStroke, Scrap } from "@/lib/types";

const PEN_COLORS = ["#111827", "#2563eb", "#dc2626", "#16a34a"];
const HIGHLIGHT_COLORS = ["#facc15", "#4ade80", "#f472b6", "#60a5fa"];
const SIZES = [
  { label: "Fine", value: 2 },
  { label: "Medium", value: 4 },
  { label: "Bold", value: 7 },
];
const emptyPage = (): NotePage => ({ strokes: [], stamps: [] });

type SaveState = "saved" | "saving" | "unsaved" | "error";
type Mode = "write" | "type";

const MODE_KEY = "scrap-mode";

// Formatting the typed text may keep; anything else (scripts, pasted styles) is dropped.
const ALLOWED_TAGS = new Set(["P", "DIV", "BR", "B", "STRONG", "I", "EM", "U", "H1", "H2", "H3", "UL", "OL", "LI", "MARK", "SPAN"]);

function cleanHtml(html: string) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      walk(child);
      if (!ALLOWED_TAGS.has(child.tagName)) {
        // Keep the words of an unknown tag but not the tag itself; drop scripts and styles entirely.
        if (["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED"].includes(child.tagName)) child.remove();
        else child.replaceWith(...Array.from(child.childNodes));
        continue;
      }
      const highlight = (child as HTMLElement).style?.backgroundColor;
      for (const attr of Array.from(child.attributes)) child.removeAttribute(attr.name);
      if (highlight) (child as HTMLElement).style.backgroundColor = highlight;
    }
  };
  const root = doc.body.firstElementChild!;
  walk(root);
  return root.innerHTML;
}

// The mode last picked on this device; otherwise typing with a mouse or trackpad, handwriting on an iPad.
function preferredMode(): Mode {
  try {
    const stored = localStorage.getItem(MODE_KEY);
    if (stored === "write" || stored === "type") return stored;
  } catch {
    // Fall through to the device default.
  }
  return window.matchMedia("(any-pointer: fine)").matches ? "type" : "write";
}

export default function ScrapEditor({ scrapId }: { scrapId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [scrap, setScrap] = useState<Scrap | null>(null);
  const [missing, setMissing] = useState(false);
  const [categories, setCategories] = useState<ArticleCategory[]>([]);
  const [folderSort] = useFolderSort();
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [pages, setPages] = useState<NotePage[]>([emptyPage()]);
  const [mode, setMode] = useState<Mode>("type");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [notice, setNotice] = useState<string | null>(null);

  const editor = useRef<HTMLDivElement>(null);
  // The typed text lives in the editor box itself; this copy is what gets saved.
  const bodyRef = useRef("");
  const [bodyTick, setBodyTick] = useState(0);
  const [isEmpty, setIsEmpty] = useState(true);

  const [tool, setTool] = useState<Tool>("pen");
  const [penColor, setPenColor] = useState(PEN_COLORS[0]);
  const [highlightColor, setHighlightColor] = useState(HIGHLIGHT_COLORS[0]);
  const [size, setSize] = useState(SIZES[0].value);
  const [fingerDraws, setFingerDraws] = useState(false);
  const history = useRef<NotePage[][]>([]);
  const [canUndo, setCanUndo] = useState(false);

  // ---------- Load ----------

  useEffect(() => {
    (async () => {
      const [s, c] = await Promise.all([
        supabase.from("scraps").select("*").eq("id", scrapId).maybeSingle(),
        supabase.from("article_categories").select("*").eq("kind", "scrap"),
      ]);
      if (!s.data) return setMissing(true);
      const loaded = s.data as Scrap;
      bodyRef.current = cleanHtml(loaded.body);
      setScrap(loaded);
      setTitle(loaded.title);
      setCategoryId(loaded.category_id);
      if (loaded.pages?.length) setPages(loaded.pages);
      setCategories((c.data ?? []) as ArticleCategory[]);
      // Open in whichever kind of writing the page already has.
      const hasText = loaded.body.replace(/<[^>]+>/g, "").trim().length > 0;
      const hasInk = (loaded.pages ?? []).some((p) => p.strokes.length);
      setMode(hasInk && !hasText ? "write" : hasText && !hasInk ? "type" : preferredMode());
    })();
  }, [supabase, scrapId]);

  // Put the typed text into the editor box when it appears; after that the box owns it.
  useEffect(() => {
    if (!scrap || mode !== "type" || !editor.current) return;
    editor.current.innerHTML = bodyRef.current;
    setIsEmpty(!editor.current.textContent?.trim());
  }, [scrap, mode]);

  // ---------- Saving ----------

  const titleRef = useRef(title);
  titleRef.current = title;
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const categoryRef = useRef(categoryId);
  categoryRef.current = categoryId;
  const save = useCallback(async () => {
    setSaveState("saving");
    const { error } = await supabase
      .from("scraps")
      .update({
        title: titleRef.current.trim().slice(0, 200) || "Untitled",
        body: cleanHtml(bodyRef.current),
        pages: pagesRef.current,
        category_id: categoryRef.current,
        updated_at: new Date().toISOString(),
      })
      .eq("id", scrapId);
    setSaveState(error ? "error" : "saved");
  }, [supabase, scrapId]);

  useEffect(() => {
    if (saveState !== "unsaved") return;
    const timer = setTimeout(save, 1200);
    return () => clearTimeout(timer);
  }, [pages, title, categoryId, bodyTick, saveState, save]);

  // Save right away if the person switches apps or closes the tab.
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === "hidden" && saveState === "unsaved") save();
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, [saveState, save]);

  function onTyped() {
    if (!editor.current) return;
    bodyRef.current = editor.current.innerHTML;
    setIsEmpty(!editor.current.textContent?.trim());
    setSaveState("unsaved");
    setBodyTick((t) => t + 1);
  }

  // ---------- Typing ----------

  function format(command: string, value?: string) {
    editor.current?.focus();
    document.execCommand("styleWithCSS", false, command === "hiliteColor" ? "true" : "false");
    document.execCommand(command, false, value);
    onTyped();
  }

  // Pasted text comes in plain, so other sites' fonts and colors don't follow it in.
  function pastePlain(e: React.ClipboardEvent) {
    e.preventDefault();
    document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
  }

  // ---------- Handwriting ----------

  function change(next: NotePage[]) {
    history.current.push(pagesRef.current);
    if (history.current.length > 100) history.current.shift();
    setCanUndo(true);
    setPages(next);
    setSaveState("unsaved");
  }

  function undo() {
    const previous = history.current.pop();
    if (!previous) return;
    setCanUndo(history.current.length > 0);
    setPages(previous);
    setSaveState("unsaved");
  }

  function addStroke(pageIndex: number, stroke: NoteStroke) {
    change(pages.map((p, i) => (i === pageIndex ? { ...p, strokes: [...p.strokes, stroke] } : p)));
  }

  function eraseStrokes(pageIndex: number, indexes: number[]) {
    const gone = new Set(indexes);
    change(pages.map((p, i) => (i === pageIndex ? { ...p, strokes: p.strokes.filter((_, j) => !gone.has(j)) } : p)));
  }

  function clearPage(pageIndex: number) {
    if (!window.confirm(`Erase everything on sheet ${pageIndex + 1}?`)) return;
    change(
      pages.length > 1 && pageIndex === pages.length - 1
        ? pages.slice(0, -1)
        : pages.map((p, i) => (i === pageIndex ? emptyPage() : p)),
    );
  }

  function chooseMode(next: Mode) {
    setMode(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      // Storage can be blocked (private browsing); the choice just isn't remembered.
    }
  }

  // ---------- Page actions ----------

  async function deleteScrap() {
    if (!window.confirm(`Delete "${title || "Untitled"}" from your ScrapBook?\nThis can't be undone.`)) return;
    const { error } = await supabase.from("scraps").delete().eq("id", scrapId);
    if (error) {
      setNotice(error.message);
      setTimeout(() => setNotice(null), 4000);
      return;
    }
    router.push("/scrapbook");
  }

  const categoryOptions = useMemo(() => {
    const byChoice = compareFolders(folderSort);
    const top = categories.filter((c) => !c.parent_id).sort(byChoice);
    return top.flatMap((c) => [
      { id: c.id, label: c.name },
      ...categories
        .filter((s) => s.parent_id === c.id)
        .sort(byChoice)
        .map((s) => ({ id: s.id, label: `  ${s.name}` })),
    ]);
  }, [categories, folderSort]);

  // ---------- Render ----------

  if (missing) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="mb-4 text-slate-600">This page isn&apos;t in your ScrapBook.</p>
        <Link href="/scrapbook" className="text-blue-600 underline">
          ← Back to ScrapBook
        </Link>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4">
        <Link href="/scrapbook" className="shrink-0 rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100">
          ← ScrapBook
        </Link>
        <span className="min-w-0 flex-1 truncate font-medium">{title || "Untitled"}</span>
        <SaveBadge state={saveState} onRetry={save} />
        <button
          onClick={deleteScrap}
          className="shrink-0 rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
        >
          🗑 Delete
        </button>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-3 p-3 md:p-5">
        {!scrap ? (
          <p className="text-slate-500">Loading…</p>
        ) : (
          <>
            <div className="flex flex-col gap-2 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <input
                value={title}
                maxLength={200}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setSaveState("unsaved");
                }}
                placeholder="Title"
                aria-label="Title"
                className="w-full text-2xl font-bold outline-none placeholder:text-slate-300"
              />
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                <select
                  value={categoryId ?? ""}
                  onChange={(e) => {
                    setCategoryId(e.target.value || null);
                    setSaveState("unsaved");
                  }}
                  className="max-w-56 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700"
                  aria-label="Category"
                >
                  <option value="">📥 Uncategorized</option>
                  {categoryOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      🏷️ {c.label}
                    </option>
                  ))}
                </select>
                <span>Created {formatDate(scrap.created_at)}</span>
              </div>
            </div>

            <div className="sticky top-[60px] z-20 flex flex-wrap items-center gap-2 rounded-xl bg-white p-2 shadow-sm ring-1 ring-slate-200">
              <div className="flex overflow-hidden rounded-lg bg-slate-100 p-0.5">
                {(
                  [
                    ["type", "⌨️ Typing"],
                    ["write", "✍️ Handwriting"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => chooseMode(id)}
                    className={`rounded-md px-3 py-1 text-sm ${mode === id ? "bg-white font-semibold shadow-sm" : "text-slate-600"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {mode === "type" ? (
                <TypingTools onFormat={format} />
              ) : (
                <InkTools
                  tool={tool}
                  setTool={setTool}
                  color={tool === "highlighter" ? highlightColor : penColor}
                  setColor={tool === "highlighter" ? setHighlightColor : setPenColor}
                  colors={tool === "highlighter" ? HIGHLIGHT_COLORS : PEN_COLORS}
                  size={size}
                  setSize={setSize}
                  canUndo={canUndo}
                  onUndo={undo}
                  fingerDraws={fingerDraws}
                  setFingerDraws={setFingerDraws}
                />
              )}
            </div>

            {mode === "type" ? (
              <div className="relative">
                {isEmpty && (
                  <p className="pointer-events-none absolute top-4 left-5 text-slate-400">
                    Start typing… (on an iPad you can also write here with Apple Pencil and it turns into text)
                  </p>
                )}
                <div
                  ref={editor}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={onTyped}
                  onPaste={pastePlain}
                  onKeyDown={(e) => {
                    if (!(e.metaKey || e.ctrlKey)) return;
                    const key = e.key.toLowerCase();
                    if (key === "b" || key === "i" || key === "u") {
                      e.preventDefault();
                      format(key === "b" ? "bold" : key === "i" ? "italic" : "underline");
                    }
                  }}
                  aria-label="Page text"
                  className="min-h-[65vh] rounded-xl bg-white px-5 py-4 text-[17px] leading-relaxed shadow-sm ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-slate-400 [&_h1]:my-2 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:my-2 [&_h2]:text-xl [&_h2]:font-semibold [&_ol]:list-decimal [&_ol]:pl-7 [&_ul]:list-disc [&_ul]:pl-7"
                />
              </div>
            ) : (
              <>
                {pages.map((page, i) => (
                  <div key={i} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between px-1 text-xs text-slate-500">
                      <span>Sheet {i + 1}</span>
                      <button onClick={() => clearPage(i)} className="rounded px-1.5 py-0.5 hover:bg-slate-200">
                        {pages.length > 1 && i === pages.length - 1 ? "Delete sheet" : "Clear sheet"}
                      </button>
                    </div>
                    <NotePageCanvas
                      page={page}
                      tool={tool}
                      color={tool === "highlighter" ? highlightColor : penColor}
                      size={size}
                      fingerDraws={fingerDraws}
                      onAddStroke={(stroke) => addStroke(i, stroke)}
                      onEraseStrokes={(indexes) => eraseStrokes(i, indexes)}
                      onStampTap={() => {}}
                      imageUrl={() => ""}
                      onDeleteImage={() => {}}
                    />
                  </div>
                ))}
                <button
                  onClick={() => change([...pages, emptyPage()])}
                  className="rounded-lg border-2 border-dashed border-slate-300 py-4 text-sm font-medium text-slate-600 hover:bg-white"
                >
                  + Add sheet
                </button>
              </>
            )}
          </>
        )}
      </main>

      {notice && (
        <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-lg bg-red-600 px-4 py-2 text-sm text-white shadow-lg">
          {notice}
        </div>
      )}
    </div>
  );
}

function TypingTools({ onFormat }: { onFormat: (command: string, value?: string) => void }) {
  const tools: { label: React.ReactNode; title: string; command: string; value?: string }[] = [
    { label: <b>B</b>, title: "Bold (Ctrl/Cmd+B)", command: "bold" },
    { label: <i>I</i>, title: "Italic (Ctrl/Cmd+I)", command: "italic" },
    { label: <u>U</u>, title: "Underline (Ctrl/Cmd+U)", command: "underline" },
    { label: "Heading", title: "Big heading", command: "formatBlock", value: "<h1>" },
    { label: "Subheading", title: "Smaller heading", command: "formatBlock", value: "<h2>" },
    { label: "Normal", title: "Normal text", command: "formatBlock", value: "<p>" },
    { label: "• List", title: "Bulleted list", command: "insertUnorderedList" },
    { label: "1. List", title: "Numbered list", command: "insertOrderedList" },
    { label: <span className="bg-yellow-200 px-0.5">Highlight</span>, title: "Highlight", command: "hiliteColor", value: "#fef08a" },
    { label: "Clear", title: "Remove bold, italic, highlight…", command: "removeFormat" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1">
      {tools.map((t) => (
        <button
          key={t.title}
          title={t.title}
          aria-label={t.title}
          // Keep the text selection when a button is pressed.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onFormat(t.command, t.value)}
          className="min-w-8 rounded-md px-2 py-1.5 text-sm ring-1 ring-slate-300 hover:bg-slate-100"
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function InkTools(props: {
  tool: Tool;
  setTool: (t: Tool) => void;
  color: string;
  setColor: (c: string) => void;
  colors: string[];
  size: number;
  setSize: (s: number) => void;
  canUndo: boolean;
  onUndo: () => void;
  fingerDraws: boolean;
  setFingerDraws: (v: boolean) => void;
}) {
  const tools: { id: Tool; label: string }[] = [
    { id: "pen", label: "Pen" },
    { id: "highlighter", label: "Highlighter" },
    { id: "eraser", label: "Eraser" },
  ];
  return (
    <>
      <div className="flex overflow-hidden rounded-lg ring-1 ring-slate-300">
        {tools.map((t) => (
          <button
            key={t.id}
            onClick={() => props.setTool(t.id)}
            className={`px-3 py-1.5 text-sm ${props.tool === t.id ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {props.tool !== "eraser" && (
        <>
          <div className="flex items-center gap-1.5">
            {props.colors.map((c) => (
              <button
                key={c}
                onClick={() => props.setColor(c)}
                aria-label={`Color ${c}`}
                className={`h-7 w-7 rounded-full ring-offset-2 ${props.color === c ? "ring-2 ring-slate-900" : ""}`}
                style={{ background: c }}
              />
            ))}
          </div>
          <div className="flex overflow-hidden rounded-lg ring-1 ring-slate-300">
            {SIZES.map((s) => (
              <button
                key={s.value}
                onClick={() => props.setSize(s.value)}
                className={`px-2.5 py-1.5 text-xs ${props.size === s.value ? "bg-slate-200 font-semibold" : "hover:bg-slate-100"}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </>
      )}
      <button
        onClick={props.onUndo}
        disabled={!props.canUndo}
        className="rounded-lg px-3 py-1.5 text-sm ring-1 ring-slate-300 hover:bg-slate-100 disabled:opacity-40"
      >
        Undo
      </button>
      <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-600">
        <input type="checkbox" checked={props.fingerDraws} onChange={(e) => props.setFingerDraws(e.target.checked)} />
        Draw with finger
      </label>
    </>
  );
}

function SaveBadge({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state === "error") {
    return (
      <button onClick={onRetry} className="shrink-0 text-xs text-red-600 underline">
        Not saved. Tap to retry
      </button>
    );
  }
  return <span className="shrink-0 text-xs text-slate-500">{state === "saved" ? "Saved" : "Saving…"}</span>;
}
