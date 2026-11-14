"use client";

// Files on a ScrapBook page: add PDFs, slides, documents or pictures, open them, view PDFs and
// pictures right on the page, and ask the AI about them (the answer goes into the page's text).
// New files stay on the computer: they open from there, and are sent to Google's AI only when
// asked about. Files added before that were uploaded to BrainShelf and still work as they did.

import StopAiButton from "@/components/StopAiButton";
import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Download, Eye, EyeOff, File as FileIcon, FileText, Film, Image as ImageIcon, Paperclip, Play, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import { Ico } from "@/components/Icon";
import { askConfirm } from "@/components/ConfirmDialog";
import { editorHtml } from "@/components/ReportRichEditor";
import { onAiJobDone, runAiJob, setAiJobNote, useAiJobs, useSecondsSince } from "@/lib/ai-jobs";
import {
  ADD_MAX_BYTES,
  ADD_MAX_MB,
  BACKUP_MAX_BYTES,
  FILES_BUCKET,
  FILES_SETUP,
  aiReadable,
  deleteScrapFiles,
  fileLink,
  formatSize,
  type ScrapFile,
} from "@/lib/files";
import { findLocalFile, forgetLocalFile, isLocalFile, rememberLocalFile, type FileHandle, type PickerWindow } from "@/lib/local-files";
import { parseReport } from "@/lib/report";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// The AI's answer as page text: the question in bold, then the answer with its headings and lists.
export function answerHtml(prompt: string, model: string | undefined, text: string) {
  return `<p><strong>✨ ${esc(prompt)}${model ? ` (${esc(model)})` : ""}</strong></p>${editorHtml(parseReport(text), (s) => s)}`;
}

const PRESETS = [
  { label: "Summary", prompt: "Summarize this file in about 150 words." },
  { label: "Key ideas", prompt: "List the key ideas in this file, one line each." },
  { label: "Action items", prompt: "List the action items or next steps in this file." },
];

const iconFor = (f: ScrapFile) =>
  f.type.startsWith("video/") ? Film : f.type === "application/pdf" ? FileText : f.type.startsWith("image/") ? ImageIcon : FileIcon;

export type Chosen = { file: File; handle?: FileHandle };

export function AttachFileButton({ onFiles, busy }: { onFiles: (files: Chosen[]) => void; busy: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  // Chrome and Edge's own picker lets the page remember a file on the computer for next time.
  async function choose() {
    const w = window as PickerWindow;
    if (!w.showOpenFilePicker) return input.current?.click();
    try {
      const handles = await w.showOpenFilePicker({ multiple: true });
      const chosen = await Promise.all(handles.map(async (handle) => ({ file: await handle.getFile(), handle })));
      if (chosen.length) onFiles(chosen);
    } catch {
      // Cancelled.
    }
  }
  return (
    <>
      <button
        onClick={choose}
        disabled={busy}
        title={`Add videos, PDFs, pictures or documents (up to ${ADD_MAX_MB} MB each). They stay on your computer; Ask AI sends Google a copy that it deletes after 48 hours.`}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ring-1 ring-slate-300 hover:bg-slate-100 disabled:opacity-50"
      >
        <Ico icon={Paperclip} tone="sky" size={16} />
        {busy ? "Adding…" : "Add file"}
      </button>
      <input
        ref={input}
        type="file"
        multiple
        className="hidden"
        accept=".pdf,.txt,.md,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.key,.pages,.numbers,image/*,video/*"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onFiles(files.map((file) => ({ file })));
        }}
      />
    </>
  );
}

// Adds files one by one; returns the ones that made it, and the first problem, if any.
// Nothing is uploaded: the page remembers the files on this computer.
export async function addFiles(files: Chosen[]) {
  const added: ScrapFile[] = [];
  let problem: string | null = null;
  const tooBig: string[] = [];
  for (const { file: f, handle } of files) {
    if (f.size > ADD_MAX_BYTES) {
      tooBig.push(`“${f.name}” (${Math.round(f.size / 1024 / 1024)} MB)`);
      continue;
    }
    try {
      added.push(await rememberLocalFile(f, handle));
    } catch (e) {
      problem ??= e instanceof Error ? e.message : "A file couldn't be added.";
      if (problem === FILES_SETUP) break;
    }
  }
  if (tooBig.length) {
    problem = `Too big to add: ${tooBig.join(", ")}. Files can be up to ${ADD_MAX_MB} MB, so ${tooBig.length > 1 ? "these weren't" : "it wasn't"} added.`;
  }
  return { added, problem };
}

export default function ScrapFiles(props: {
  supabase: SupabaseClient;
  scrapId: string;
  files: ScrapFile[];
  onChange: (files: ScrapFile[]) => void;
  // The AI's answer, as HTML to add to the end of the page's text.
  onAnswer: (html: string) => void;
  onNotice: (text: string) => void;
}) {
  const { supabase, scrapId, files } = props;
  const [viewing, setViewing] = useState<{ path: string; url: string } | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");

  // A file opened from the computer is shown through a temporary link, released when hidden.
  useEffect(() => {
    const url = viewing?.url;
    return () => {
      if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
    };
  }, [viewing]);

  const aiJobs = useAiJobs();
  const aiKey = `file-ask:${scrapId}`;
  const aiJob = aiJobs.running.find((j) => j.key === aiKey);
  const aiStartedAt = aiJob?.startedAt ?? null;
  const aiError = aiJobs.errors.get(aiKey) ?? null;

  // An answer that arrives while the page is open goes straight into its text.
  const { onAnswer } = props;
  useEffect(
    () =>
      onAiJobDone((key, html) => {
        if (key !== `file-ask:${scrapId}`) return false;
        onAnswer(html as string);
        return true;
      }),
    [scrapId, onAnswer],
  );

  async function open(f: ScrapFile, download = false) {
    if (isLocalFile(f)) {
      if (/^(video\/|image\/|application\/pdf$)/.test(f.type)) return toggleView(f);
      // Slides, documents and the like open (or download) in the browser from the computer.
      const file = await findLocalFile(f);
      if (file) window.open(URL.createObjectURL(file), "_blank", "noopener");
      return;
    }
    try {
      const url = await fileLink(supabase, f.path, download);
      if (download) window.location.href = url;
      else window.open(url, "_blank", "noopener");
    } catch (e) {
      props.onNotice(e instanceof Error ? e.message : "The file couldn't be opened.");
    }
  }

  async function toggleView(f: ScrapFile) {
    if (viewing?.path === f.path) return setViewing(null);
    if (isLocalFile(f)) {
      const file = await findLocalFile(f);
      if (file) setViewing({ path: f.path, url: URL.createObjectURL(file) });
      return;
    }
    try {
      setViewing({ path: f.path, url: await fileLink(supabase, f.path) });
    } catch (e) {
      props.onNotice(e instanceof Error ? e.message : "The file couldn't be opened.");
    }
  }

  async function remove(f: ScrapFile) {
    const ok = await askConfirm({
      title: `Delete "${f.name}"?`,
      message: "The file will be removed from this page. Notes you took about it stay.",
      confirmLabel: "Yes, delete",
      cancelLabel: "Keep it",
      danger: true,
    });
    if (!ok) return;
    if (isLocalFile(f)) {
      await forgetLocalFile(f.path);
      forgetSent(f.path);
    }
    else await deleteScrapFiles(supabase, [f.path]);
    if (viewing?.path === f.path) setViewing(null);
    props.onChange(files.filter((x) => x.path !== f.path));
  }

  // The AI keeps working if the person leaves; the answer is then added to the saved page.
  // A file on this computer is sent to the AI first (asking for it again if needed).
  async function ask(f: ScrapFile, text: string) {
    const clean = text.trim();
    if (!clean || aiStartedAt !== null) return;
    // A file sent in the last 48 hours is still with Google, so it isn't sent again.
    const sentBefore = isLocalFile(f) ? sentVideo(f.path) : null;
    const onComputer = isLocalFile(f) && !sentBefore ? await findLocalFile(f) : null;
    if (isLocalFile(f) && !sentBefore && !onComputer) return props.onNotice(`Choose "${f.name}" on this computer to ask the AI about it.`);
    setPrompt("");
    setAsking(null);
    runAiJob<string>({
      key: aiKey,
      label: `AI answer about "${f.name}"`,
      work: async (signal) => {
        let target: { path?: string; geminiFile?: string; parts?: string[]; size?: number } = { path: f.path };
        try {
          if (sentBefore) target = { geminiFile: sentBefore };
          else if (onComputer) {
            const sent = await sendFile(supabase, onComputer, f.type, signal, (note) => setAiJobNote(aiKey, note));
            if (sent.error) return { error: sent.error };
            target = { geminiFile: sent.geminiFile, parts: sent.parts, size: sent.size };
          }
          if (isLocalFile(f)) setAiJobNote(aiKey, f.type.startsWith("video/") ? "The AI is watching the video…" : "The AI is reading the file…");
          const res = await fetch("/api/file-ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...target, name: f.name, type: f.type, prompt: clean }),
            signal,
          });
          const data = await res.json().catch(() => ({}));
          if (sentBefore && res.status === 403) {
            forgetSent(f.path);
            return { error: "Google no longer has this file. Ask again and it will be sent again." };
          }
          if (isLocalFile(f) && res.ok && data.geminiFile) rememberSent(f.path, data.geminiFile);
          if (!res.ok || !data.text) {
            return { error: res.status === 504 ? "The AI took too long. Try a smaller file." : (data.error ?? `The AI couldn't answer (error ${res.status}).`) };
          }
          return { result: answerHtml(`${clean} (${f.name})`, data.model, data.text) };
        } catch {
          // Stopped or failed before the AI got it: tidy away the temporary pieces.
          if (target.parts?.length) await supabase.storage.from(FILES_BUCKET).remove(target.parts);
          return { error: "The AI couldn't be reached. Check your connection and try again." };
        }
      },
      fallback: async (html) => {
        const { data } = await supabase.from("scraps").select("body").eq("id", scrapId).maybeSingle();
        const { error } = await supabase
          .from("scraps")
          .update({ body: `${(data?.body as string | undefined) ?? ""}${html}`, updated_at: new Date().toISOString() })
          .eq("id", scrapId);
        if (error) throw error;
      },
    });
  }

  if (!files.length && aiStartedAt === null && !aiError) return null;

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <Ico icon={Paperclip} tone="sky" size={15} />
        Files
      </p>
      {files.map((f) => {
        const local = isLocalFile(f);
        const isVideo = f.type.startsWith("video/");
        const canView = isVideo || f.type === "application/pdf" || f.type.startsWith("image/");
        return (
          <div key={f.path} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5 ring-1 ring-slate-200">
              <Ico icon={iconFor(f)} tone={f.type === "application/pdf" ? "red" : "sky"} size={16} />
              <button
                onClick={() => open(f)}
                className="min-w-0 truncate text-left text-sm font-medium text-slate-800 hover:underline"
                title={local ? "Open from this computer" : "Open in a new tab"}
              >
                {f.name}
              </button>
              <span className="text-xs text-slate-500" title={local ? "Kept on your computer, not uploaded" : "Saved in BrainShelf"}>
                {formatSize(f.size)}
                {local ? " · on this computer" : " · saved in BrainShelf"}
              </span>
              <span className="ml-auto flex flex-wrap items-center gap-1">
                {canView && (
                  <SmallButton onClick={() => toggleView(f)} icon={viewing?.path === f.path ? EyeOff : isVideo ? Play : Eye}>
                    {viewing?.path === f.path ? "Hide" : isVideo ? "Play" : "View"}
                  </SmallButton>
                )}
                {aiReadable(f) && (
                  <SmallButton onClick={() => setAsking(asking === f.path ? null : f.path)} icon={Sparkles} disabled={aiStartedAt !== null}>
                    Ask AI
                  </SmallButton>
                )}
                {!local && (
                  <SmallButton onClick={() => open(f, true)} icon={Download}>
                    Download
                  </SmallButton>
                )}
                <SmallButton onClick={() => remove(f)} icon={Trash2} danger>
                  Delete
                </SmallButton>
              </span>
            </div>
            {asking === f.path && (
              <div className="flex flex-col gap-2 rounded-lg bg-violet-50 p-2 ring-1 ring-violet-200">
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => ask(f, p.prompt)}
                      className="rounded-full bg-white px-3 py-1 text-xs text-violet-800 ring-1 ring-violet-200 hover:bg-violet-100"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    ask(f, prompt);
                  }}
                  className="flex gap-2"
                >
                  <input
                    autoFocus
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    maxLength={2000}
                    placeholder="Ask anything about this file…"
                    className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
                  />
                  <button type="submit" disabled={!prompt.trim()} className="rounded-md bg-violet-600 px-3 py-1 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
                    Ask
                  </button>
                </form>
                <p className="text-xs text-violet-800">
                  {local ? "The file is sent to Google's AI for this question and kept there 48 hours, not in BrainShelf. " : ""}
                  The answer is added to the end of this page&apos;s text, where you can edit it.
                </p>
              </div>
            )}
            {viewing?.path === f.path &&
              (isVideo ? (
                <video src={viewing.url} controls autoPlay className="max-h-[75vh] w-full rounded-md bg-black ring-1 ring-slate-200" />
              ) : f.type.startsWith("image/") ? (
                <img src={viewing.url} alt={f.name} className="max-h-[70vh] w-auto max-w-full self-start rounded-md ring-1 ring-slate-200" />
              ) : (
                <iframe src={viewing.url} title={f.name} className="h-[75vh] w-full rounded-md ring-1 ring-slate-200" />
              ))}
          </div>
        );
      })}
      {aiStartedAt !== null && <Working startedAt={aiStartedAt} jobKey={aiKey} note={aiJob?.note} />}
      {aiError && (
        <p className="flex items-center gap-1.5 rounded-md bg-red-50 px-2 py-1.5 text-sm text-red-700 ring-1 ring-red-200">
          <Ico icon={TriangleAlert} tone="red" size={15} />
          {aiError}
        </p>
      )}
    </div>
  );
}

// Videos sent to Google stay there 48 hours. This device remembers them a little less long,
// so more questions about the same file don't send it again.
const SENT_HOURS = 46;
const sentKey = (path: string) => `video-ai:${path}`;

function sentVideo(path: string): string | null {
  try {
    const saved = JSON.parse(localStorage.getItem(sentKey(path)) ?? "null") as { name: string; until: number } | null;
    return saved && saved.until > Date.now() ? saved.name : null;
  } catch {
    return null;
  }
}

function rememberSent(path: string, name: string) {
  try {
    localStorage.setItem(sentKey(path), JSON.stringify({ name, until: Date.now() + SENT_HOURS * 3600_000 }));
  } catch {
    // Storage blocked: the file is just sent again next time.
  }
}

function forgetSent(path: string) {
  try {
    localStorage.removeItem(sentKey(path));
  } catch {
    // Nothing to forget.
  }
}

// Sends the file in one go, reporting progress (fetch can't report upload progress).
function postWithProgress(url: string, video: File, signal: AbortSignal, onProgress: (share: number) => void) {
  return new Promise<{ ok: boolean; json: { file?: { name?: string } } | null }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("X-Goog-Upload-Offset", "0");
    xhr.setRequestHeader("X-Goog-Upload-Command", "upload, finalize");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let json = null;
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        // Not JSON: treated as a failure.
      }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, json });
    };
    xhr.onerror = () => reject(new TypeError("Upload refused"));
    xhr.onabort = () => reject(new DOMException("Stopped", "AbortError"));
    signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(video);
  });
}

const percent = (share: number) => `Sending the file to the AI… ${Math.min(99, Math.floor(share * 100))}%`;

// Pieces of a file sent through Supabase, under its 25 MB per-file limit.
const PIECE_BYTES = 20 * 1024 * 1024;

// Sends a file from this computer to the AI: straight to Google when the browser may, or
// in pieces through a temporary Supabase folder (emptied right after) when it may not.
async function sendFile(
  supabase: SupabaseClient,
  video: File,
  type: string,
  signal: AbortSignal,
  onNote: (note: string) => void,
): Promise<{ geminiFile?: string; parts?: string[]; size?: number; error?: string }> {
  onNote(percent(0));
  const start = await fetch("/api/file-ai/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ size: video.size, type }),
    signal,
  });
  const link = await start.json().catch(() => ({}));
  if (start.ok && link.uploadUrl) {
    try {
      const res = await postWithProgress(link.uploadUrl, video, signal, (share) => onNote(percent(share)));
      const name = res.json?.file?.name;
      if (res.ok && name) return { geminiFile: name };
    } catch (e) {
      if (signal.aborted) throw e;
      // The browser wasn't allowed to send it straight to Google: use the backup route.
    }
  } else if (start.status !== 501) {
    return { error: link.error ?? `The file couldn't be sent to the AI (error ${start.status}).` };
  }
  if (video.size > BACKUP_MAX_BYTES) {
    return { error: "The file is over 300 MB, too big to send from this browser. Try a smaller one." };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're signed out. Sign in again." };
  // In pieces small enough for Supabase's per-file limit; the server joins them for the AI.
  const folder = `${user.id}/tmp/${crypto.randomUUID()}`;
  const parts: string[] = [];
  const tidy = () => (parts.length ? supabase.storage.from(FILES_BUCKET).remove(parts) : Promise.resolve());
  for (let from = 0, i = 0; from < video.size; from += PIECE_BYTES, i++) {
    const path = `${folder}/part-${String(i).padStart(3, "0")}`;
    const { error } = await supabase.storage.from(FILES_BUCKET).upload(path, video.slice(from, from + PIECE_BYTES), {
      contentType: "application/octet-stream",
    });
    if (error) {
      await tidy();
      return { error: `The file couldn't be sent to the AI: ${error.message}` };
    }
    parts.push(path);
    onNote(percent(Math.min(1, (from + PIECE_BYTES) / video.size)));
    if (signal.aborted) {
      await tidy();
      throw new DOMException("Stopped", "AbortError");
    }
  }
  return { parts, size: video.size };
}

function SmallButton(props: { onClick: () => void; icon: typeof Eye; children: React.ReactNode; danger?: boolean; disabled?: boolean }) {
  const Icon = props.icon;
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      className={`inline-flex items-center gap-1 rounded-md border bg-white px-2 py-0.5 text-xs disabled:opacity-50 ${props.danger ? "border-red-200 text-red-600 hover:bg-red-50" : "border-slate-300 text-slate-700 hover:bg-slate-100"}`}
    >
      <Icon size={13} aria-hidden />
      {props.children}
    </button>
  );
}

function Working({ startedAt, jobKey, note }: { startedAt: number; jobKey: string; note?: string }) {
  const s = useSecondsSince(startedAt);
  const time = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const sending = note?.match(/(\d+)%$/);
  return (
    <div className="flex items-start gap-2 rounded-md bg-violet-50 px-2 py-1.5 text-sm text-violet-800 ring-1 ring-violet-200">
      <div className="min-w-0 flex-1">
        <p>
          <span className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-300 border-t-violet-700 align-[-2px]" />
          {note ?? "The AI is reading the file…"} ({time})
        </p>
        {sending && (
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-violet-200" role="progressbar" aria-valuenow={Number(sending[1])}>
            <div className="h-full rounded-full bg-violet-600 transition-[width]" style={{ width: `${sending[1]}%` }} />
          </div>
        )}
        <p className="mt-1 text-xs text-violet-700">
          {sending ? "Keep this tab open while the file sends. " : ""}You can go to another page; the answer is still added here.
        </p>
      </div>
      <StopAiButton jobKey={jobKey} />
    </div>
  );
}
