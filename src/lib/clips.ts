// Pictures (screenshots of the video) pasted into notes.
// Stored in the public "clips" Supabase Storage bucket under the owner's user id.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotePage } from "@/lib/types";
import { formatTime } from "@/lib/youtube-player";

export const CLIPS_BUCKET = "clips";
const MAX_WIDTH = 1280;

export type ClipImage = { blob: Blob; width: number; height: number };

// Shrinks a picture to at most 1280px wide and saves it as JPEG (usually 100-200 KB).
export async function compressImage(source: Blob): Promise<ClipImage> {
  const bitmap = await createImageBitmap(source);
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const out = document.createElement("canvas");
  out.width = Math.round(bitmap.width * scale);
  out.height = Math.round(bitmap.height * scale);
  out.getContext("2d")!.drawImage(bitmap, 0, 0, out.width, out.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    out.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't create the picture"))), "image/jpeg", 0.82),
  );
  return { blob, width: out.width, height: out.height };
}

export async function uploadClip(supabase: SupabaseClient, image: ClipImage): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You're signed out. Sign in again to save clips.");
  const path = `${user.id}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from(CLIPS_BUCKET)
    .upload(path, image.blob, { contentType: "image/jpeg", cacheControl: "31536000" });
  if (error) throw new Error(error.message);
  return path;
}

export function clipUrl(supabase: SupabaseClient, path: string) {
  return supabase.storage.from(CLIPS_BUCKET).getPublicUrl(path).data.publicUrl;
}

// ---------- Clips in typed notes ----------

function toSeconds(time: string) {
  const parts = time.split(":").map(Number);
  return parts.reduce((total, n) => total * 60 + n, 0);
}

// Typed notes store clips as "[12:34] ![clip](path)".
const CLIP_PATTERN = /(?:\[([\d:]+)\]\s*)?!\[clip\]\(([^)\s]+)\)/g;

// A clip in typed notes. t is null when its time was removed.
export type TypedClip = { path: string; t: number | null };

// Typed clips are saved after the notes, below this line, so they never show in the text box.
const CLIPS_MARKER = "\n\n--- clips ---\n";

export function splitTypedClips(saved: string) {
  const clips: TypedClip[] = Array.from(saved.matchAll(CLIP_PATTERN), (m) => ({
    path: m[2],
    t: m[1] ? toSeconds(m[1]) : null,
  }));
  // Older notes had clips mixed into the text; take them out of it.
  const text = saved.includes(CLIPS_MARKER)
    ? saved.split(CLIPS_MARKER)[0]
    : saved.replace(new RegExp(`${CLIP_PATTERN.source}\\n?`, "g"), "");
  return { text, clips };
}

export function joinTypedClips(text: string, clips: TypedClip[]) {
  if (!clips.length) return text;
  const lines = clips.map((c) => `${c.t === null ? "" : `[${formatTime(c.t)}] `}![clip](${c.path})`);
  return text + CLIPS_MARKER + lines.join("\n");
}

// ---------- Managing stored clips ----------

export type StoredClip = { path: string; createdAt: string; size: number };

// Every clip picture this person has stored, newest first.
export async function listClips(supabase: SupabaseClient): Promise<StoredClip[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You're signed out. Sign in again.");
  const clips: StoredClip[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.storage
      .from(CLIPS_BUCKET)
      .list(user.id, { limit: pageSize, offset, sortBy: { column: "created_at", order: "desc" } });
    if (error) throw new Error(error.message);
    for (const item of data) {
      if (!item.id) continue; // skip folders
      clips.push({
        path: `${user.id}/${item.name}`,
        createdAt: item.created_at ?? item.updated_at ?? new Date().toISOString(),
        size: item.metadata?.size ?? 0,
      });
    }
    if (data.length < pageSize) return clips;
  }
}

type NoteRow = { video_id: string; pages: NotePage[] | null; text: string | null };
// Reading and ScrapBook keep clips too: typed article notes, and a ScrapBook page's text and sheets.
export type ArticleRow = { id: string; title: string | null; notes: string | null };
export type ScrapRow = { id: string; title: string; body: string | null; pages: NotePage[] | null };
export type ClipHomes = { notes: NoteRow[]; articles: ArticleRow[]; scraps: ScrapRow[] };

// A ScrapBook page's typed text holds clips as <img src=".../clips/<path>">.
const BODY_CLIP = /<img\b[^>]*?src="[^"]*\/object\/public\/clips\/([^"?]+)[^"]*"[^>]*>/g;

export function bodyClipPaths(body: string) {
  return Array.from(body.matchAll(BODY_CLIP), (m) => decodeURIComponent(m[1]));
}

export type ClipOwner = { kind: "video" | "article" | "scrap"; id: string };

// Which notes each clip is in.
export function clipOwners(homes: ClipHomes) {
  const where = new Map<string, ClipOwner>();
  for (const note of homes.notes) {
    const owner = { kind: "video" as const, id: note.video_id };
    for (const page of note.pages ?? []) for (const im of page.images ?? []) where.set(im.path, owner);
    for (const c of splitTypedClips(note.text ?? "").clips) where.set(c.path, owner);
  }
  for (const a of homes.articles) {
    for (const c of splitTypedClips(a.notes ?? "").clips) where.set(c.path, { kind: "article", id: a.id });
  }
  for (const sc of homes.scraps) {
    const owner = { kind: "scrap" as const, id: sc.id };
    for (const page of sc.pages ?? []) for (const im of page.images ?? []) where.set(im.path, owner);
    for (const path of bodyClipPaths(sc.body ?? "")) where.set(path, owner);
  }
  return where;
}

const withoutImages = (pages: NotePage[], gone: Set<string>) =>
  pages.map((p) => ({ ...p, images: (p.images ?? []).filter((im) => !gone.has(im.path)) }));

// Takes the clips out of every note that shows them, then deletes the pictures to free the space.
export async function deleteClips(supabase: SupabaseClient, homes: ClipHomes, paths: string[]) {
  const gone = new Set(paths);
  for (const note of homes.notes) {
    const pages = note.pages ?? [];
    const typed = splitTypedClips(note.text ?? "");
    const usesGone =
      pages.some((p) => (p.images ?? []).some((im) => gone.has(im.path))) || typed.clips.some((c) => gone.has(c.path));
    if (!usesGone) continue;
    const { error } = await supabase
      .from("notes")
      .update({
        pages: withoutImages(pages, gone),
        text: joinTypedClips(
          typed.text,
          typed.clips.filter((c) => !gone.has(c.path)),
        ),
        updated_at: new Date().toISOString(),
      })
      .eq("video_id", note.video_id);
    if (error) throw new Error(error.message);
  }
  for (const a of homes.articles) {
    const typed = splitTypedClips(a.notes ?? "");
    if (!typed.clips.some((c) => gone.has(c.path))) continue;
    const { error } = await supabase
      .from("articles")
      .update({ notes: joinTypedClips(typed.text, typed.clips.filter((c) => !gone.has(c.path))) })
      .eq("id", a.id);
    if (error) throw new Error(error.message);
  }
  for (const sc of homes.scraps) {
    const pages = sc.pages ?? [];
    const body = sc.body ?? "";
    const usesGone =
      pages.some((p) => (p.images ?? []).some((im) => gone.has(im.path))) || bodyClipPaths(body).some((p) => gone.has(p));
    if (!usesGone) continue;
    const { error } = await supabase
      .from("scraps")
      .update({
        pages: withoutImages(pages, gone),
        body: body.replace(BODY_CLIP, (tag, path: string) => (gone.has(decodeURIComponent(path)) ? "" : tag)),
      })
      .eq("id", sc.id);
    if (error) throw new Error(error.message);
  }
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await supabase.storage.from(CLIPS_BUCKET).remove(paths.slice(i, i + 100));
    if (error) throw new Error(error.message);
  }
}
