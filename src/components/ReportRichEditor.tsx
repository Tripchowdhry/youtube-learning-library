"use client";

// A Word-style editor for a report: a toolbar for styles, bold, lists and links, and the text
// shown already formatted. Underneath, the report is still kept in the simple text format that
// Copy and Download Word read, so nothing else changes.

import { markAiQuestions } from "@/lib/notes-format";
import { revealAdded } from "@/lib/reveal";
import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { Bold, Italic, Link2, List, ListOrdered, Quote, Redo2, Underline, Undo2, type LucideIcon } from "lucide-react";
import { parseReport, type Block, type Inline } from "@/lib/report";

type Resolve = (src: string) => string;

const STYLES = [
  { value: "p", label: "Normal text" },
  { value: "h1", label: "Title" },
  { value: "h2", label: "Heading" },
  { value: "h3", label: "Subheading" },
] as const;
type Style = (typeof STYLES)[number]["value"];

// ---------- Report text → editor HTML ----------

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inlineHtml(parts: Inline[]) {
  return parts
    .map((p) => {
      let html = esc(p.text);
      if (p.bold) html = `<strong>${html}</strong>`;
      if (p.italic) html = `<em>${html}</em>`;
      if (p.underline) html = `<u>${html}</u>`;
      if (p.href) html = `<a href="${esc(p.href)}">${html}</a>`;
      return html;
    })
    .join("");
}

export function editorHtml(blocks: Block[], resolve: Resolve) {
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  const close = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const b of blocks) {
    const want = b.type === "li" ? "ul" : b.type === "ol" ? "ol" : null;
    if (want !== list) {
      close();
      if (want) out.push(b.type === "ol" && b.num !== "1" ? `<ol start="${esc(b.num)}">` : `<${want}>`);
      list = want;
    }
    if (b.type === "img") {
      out.push(
        `<figure contenteditable="false" data-src="${esc(b.src)}" data-caption="${esc(b.caption)}">` +
          `<img src="${esc(resolve(b.src))}" alt="${esc(b.caption || "Picture from the notes")}">` +
          (b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : "") +
          `</figure>`,
      );
    } else if (b.type === "li" || b.type === "ol") out.push(`<li>${inlineHtml(b.inline)}</li>`);
    else if (b.type === "quote") out.push(`<blockquote>${inlineHtml(b.inline)}</blockquote>`);
    else out.push(`<${b.type}>${inlineHtml(b.inline)}</${b.type}>`);
  }
  close();
  return out.join("") || "<p><br></p>";
}

// ---------- Editor HTML → report text ----------

type Mark = "bold" | "italic" | "underline";
const WRAP: Record<Mark, string> = { bold: "**", italic: "_", underline: "++" };

// The marks an element adds: by its tag, or by its style (text pasted from Word or the web).
function marksOf(el: HTMLElement): Mark[] {
  const tag = el.tagName;
  const out: Mark[] = [];
  if (tag === "STRONG" || tag === "B" || /^(bold|[6-9]00)$/.test(el.style.fontWeight)) out.push("bold");
  if (tag === "EM" || tag === "I" || el.style.fontStyle === "italic") out.push("italic");
  if (tag === "U" || /underline/.test(el.style.textDecoration || el.style.textDecorationLine)) out.push("underline");
  return out;
}

function inlineText(node: Node, active: Set<Mark> = new Set()): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? "").replace(/\s+/g, " ");
  if (!(node instanceof HTMLElement)) return "";
  const tag = node.tagName;
  if (tag === "BR") return " ";
  const added = marksOf(node).filter((m) => !active.has(m));
  const inner = Array.from(node.childNodes)
    .map((c) => inlineText(c, new Set([...active, ...added])))
    .join("");
  let out = inner;
  const t = inner.trim();
  if (t && added.length) {
    // Bold outside, then italic, then underline: **_x_** style nesting the parser reads back.
    const open = added.map((m) => WRAP[m]).join("");
    const close = [...added].reverse().map((m) => WRAP[m]).join("");
    out = inner.replace(t, `${open}${t}${close}`);
  }
  if (tag === "A") {
    const href = node.getAttribute("href") ?? "";
    const text = out.trim();
    return /^https?:\/\//.test(href) && text ? (inner.trim() === href ? href : `[${text}](${href})`) : out;
  }
  return out;
}

const BLOCK_TAGS = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "BLOCKQUOTE", "FIGURE", "SECTION", "ARTICLE"]);

function blockLines(node: Node, lines: string[]) {
  if (node.nodeType === Node.TEXT_NODE) {
    const t = (node.textContent ?? "").replace(/\s+/g, " ").trim();
    if (t) lines.push(t);
    return;
  }
  if (!(node instanceof HTMLElement)) return;
  const tag = node.tagName;
  const text = () => inlineText(node).trim();
  if (tag === "FIGURE" && node.dataset.src) {
    lines.push(`![${node.dataset.caption || "clip"}](${node.dataset.src})`);
  } else if (/^H[1-6]$/.test(tag)) {
    const level = Math.min(3, Number(tag[1]));
    if (text()) lines.push(`${"#".repeat(level)} ${text()}`);
  } else if (tag === "UL" || tag === "OL") {
    let n = Number(node.getAttribute("start")) || 1;
    for (const li of Array.from(node.children)) {
      const t = inlineText(li).trim();
      if (!t) continue;
      lines.push(tag === "OL" ? `${n++}. ${t}` : `- ${t}`);
    }
  } else if (tag === "BLOCKQUOTE") {
    if (text()) lines.push(`> ${text()}`);
  } else if ((tag === "DIV" || tag === "SECTION" || tag === "ARTICLE" || tag === "P") && Array.from(node.children).some((c) => BLOCK_TAGS.has(c.tagName))) {
    // A wrapper around other blocks (pasted text often has these).
    let inline = "";
    const flush = () => {
      if (inline.trim()) lines.push(inline.trim());
      inline = "";
    };
    for (const c of Array.from(node.childNodes)) {
      if (c instanceof HTMLElement && BLOCK_TAGS.has(c.tagName)) {
        flush();
        blockLines(c, lines);
      } else inline += inlineText(c);
    }
    flush();
  } else if (tag === "IMG") {
    // A picture pasted from elsewhere can't be kept: only clips from your notes can.
  } else if (text()) {
    lines.push(text());
  }
}

export function editorToReport(root: HTMLElement) {
  const lines: string[] = [];
  for (const c of Array.from(root.childNodes)) blockLines(c, lines);
  // Blank lines between blocks, like the reports Report Writer builds itself; list items stay together.
  const isItem = (l: string) => /^(- |\d+\. )/.test(l);
  return lines.map((l, i) => (i === 0 ? "" : isItem(l) && isItem(lines[i - 1]) ? "\n" : "\n\n") + l).join("");
}

// The first words of a line without Markdown marks or spaces, for matching a shown paragraph.
const plainStart = (text: string) =>
  (text.split("\n").find((l) => l.trim()) ?? "")
    .replace(/[*_#>`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);

// ---------- The editor ----------

// What a page can do to the editor from outside: put text at the cursor (a video time) or
// show the end (after an AI answer is added).
export type RichEditorHandle = {
  insertAtLineStart: (text: string) => void;
  scrollToEnd: () => void;
  // Scrolls to the last paragraph that starts with this text and lights it up, with all
  // that follows it (an AI answer just added at the end).
  revealFrom: (startText: string) => void;
};

export default function ReportRichEditor({
  body,
  onChange,
  resolve,
  label = "Report",
  placeholder = "Build the report above, or start typing here.",
  boxClassName = "min-h-[28rem]",
  onKeyDown,
  handle,
}: {
  body: string;
  onChange: (body: string) => void;
  resolve: Resolve;
  label?: string;
  placeholder?: string;
  // Sizes the typing area, e.g. a fixed height that scrolls for notes.
  boxClassName?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  handle?: React.Ref<RichEditorHandle>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<string | null>(null);
  const savedRange = useRef<Range | null>(null);
  const [style, setStyle] = useState<Style | "">("p");
  const [marks, setMarks] = useState({ bold: false, italic: false, underline: false });
  const [linking, setLinking] = useState<string | null>(null);

  // Show the report, unless the change came from typing here (that would move the cursor).
  useEffect(() => {
    if (!ref.current || body === lastEmitted.current) return;
    ref.current.innerHTML = editorHtml(parseReport(body), resolve);
    markAiQuestions(ref.current);
    lastEmitted.current = body;
  }, [body, resolve]);

  // Keep the toolbar in step with where the cursor is.
  useEffect(() => {
    const update = () => {
      const sel = document.getSelection();
      if (!sel?.rangeCount || !ref.current?.contains(sel.anchorNode)) return;
      savedRange.current = sel.getRangeAt(0).cloneRange();
      const block = String(document.queryCommandValue("formatBlock") || "p").toLowerCase();
      setStyle((STYLES.some((s) => s.value === block) ? block : block === "div" ? "p" : "") as Style | "");
      setMarks({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
      });
    };
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, []);

  const emit = () => {
    if (!ref.current) return;
    markAiQuestions(ref.current);
    const next = editorToReport(ref.current);
    lastEmitted.current = next;
    onChange(next);
  };

  // Puts the cursor back after using the toolbar's menu or link box. Left alone when the editor
  // still has it, so a pending style (Bold then Underline before typing) isn't lost.
  const restore = () => {
    if (document.activeElement === ref.current) return;
    ref.current?.focus();
    const r = savedRange.current;
    if (r) {
      const sel = document.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
    }
  };

  const run = (command: string, value?: string) => {
    restore();
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand("defaultParagraphSeparator", false, "p");
    document.execCommand(command, false, value);
    emit();
  };

  // Pasted text keeps its headings, lists, bold and links, but not other people's styling.
  const paste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const html = e.clipboardData.getData("text/html");
    const md = html
      ? (() => {
          const box = document.createElement("div");
          box.innerHTML = html;
          return editorToReport(box);
        })()
      : e.clipboardData.getData("text/plain");
    const blocks = parseReport(md);
    if (blocks.length <= 1 && blocks[0]?.type === "p") document.execCommand("insertHTML", false, inlineHtml(blocks[0].inline));
    else if (blocks.length) document.execCommand("insertHTML", false, editorHtml(blocks, resolve));
    emit();
  };

  useImperativeHandle(handle, () => ({
    // Starts a new line first when the cursor has text before it on its line.
    insertAtLineStart(text: string) {
      const box = ref.current;
      if (!box) return;
      const known = document.activeElement === box || (savedRange.current && box.contains(savedRange.current.startContainer));
      restore();
      const sel = document.getSelection();
      if (!known || !sel?.rangeCount || !box.contains(sel.anchorNode)) {
        // No cursor yet: go to the end of the notes.
        const r = document.createRange();
        r.selectNodeContents(box.lastElementChild ?? box);
        r.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(r);
      }
      const here = document.getSelection()!.getRangeAt(0);
      let block: Node | null = here.startContainer;
      while (block && block.parentNode !== box) block = block.parentNode;
      if (block) {
        const before = document.createRange();
        before.setStart(block, 0);
        before.setEnd(here.startContainer, here.startOffset);
        if (before.toString().trim()) document.execCommand("insertParagraph");
      }
      document.execCommand("insertText", false, text);
      emit();
    },
    scrollToEnd() {
      if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
    },
    revealFrom(startText) {
      const blocks = Array.from(ref.current?.children ?? []);
      const want = plainStart(startText);
      const at = blocks.findLastIndex((b) => want && plainStart(b.textContent ?? "").startsWith(want));
      if (at >= 0) revealAdded(blocks.slice(at));
      else if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
    },
  }));

  const addLink = () => {
    const url = (linking ?? "").trim();
    setLinking(null);
    if (!url) return;
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    restore();
    const sel = document.getSelection();
    if (sel && sel.isCollapsed) document.execCommand("insertHTML", false, `<a href="${esc(href)}">${esc(href)}</a>`);
    else document.execCommand("createLink", false, href);
    emit();
  };

  return (
    <div className="rounded-md border border-slate-300">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1.5" onMouseDown={(e) => e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement || e.preventDefault()}>
        <select
          value={style}
          onChange={(e) => run("formatBlock", `<${e.target.value}>`)}
          aria-label="Text style"
          className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-sm"
        >
          {style === "" && <option value="">—</option>}
          {STYLES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <Divider />
        <ToolButton label="Bold" Icon={Bold} active={marks.bold} onClick={() => run("bold")} />
        <ToolButton label="Italic" Icon={Italic} active={marks.italic} onClick={() => run("italic")} />
        <ToolButton label="Underline" Icon={Underline} active={marks.underline} onClick={() => run("underline")} />
        <ToolButton label="Bullet list" Icon={List} onClick={() => run("insertUnorderedList")} />
        <ToolButton label="Numbered list" Icon={ListOrdered} onClick={() => run("insertOrderedList")} />
        <ToolButton label="Quote" Icon={Quote} onClick={() => run("formatBlock", style === "" ? "<p>" : "<blockquote>")} />
        <ToolButton label="Link" Icon={Link2} onClick={() => setLinking("")} />
        <Divider />
        <ToolButton label="Undo" Icon={Undo2} onClick={() => run("undo")} />
        <ToolButton label="Redo" Icon={Redo2} onClick={() => run("redo")} />
      </div>
      {linking !== null && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addLink();
          }}
          className="flex items-center gap-2 border-b border-slate-200 bg-white px-2 py-1.5 text-sm"
        >
          <input
            autoFocus
            value={linking}
            onChange={(e) => setLinking(e.target.value)}
            placeholder="Paste a web address"
            aria-label="Link address"
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1"
          />
          <button type="submit" className="rounded-md bg-blue-600 px-2.5 py-1 font-medium text-white hover:bg-blue-700">
            Add link
          </button>
          <button type="button" onClick={() => setLinking(null)} className="rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
        </form>
      )}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline
        aria-label={label}
        onInput={emit}
        onPaste={paste}
        onKeyDown={onKeyDown}
        data-placeholder={placeholder}
        className={`report-editor ${boxClassName} px-4 py-3 text-slate-800 outline-none`}
      />
    </div>
  );
}

export function ToolButton({ label, Icon, onClick, active }: { label: string; Icon: LucideIcon; onClick: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`rounded p-1.5 ${active ? "bg-slate-200 text-slate-900" : "text-slate-600 hover:bg-slate-200 hover:text-slate-900"}`}
    >
      <Icon size={16} />
    </button>
  );
}

export const Divider = () => <span className="mx-0.5 h-5 w-px bg-slate-300" aria-hidden />;
