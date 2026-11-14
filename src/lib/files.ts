// Files attached to ScrapBook pages (PDFs, slides, documents, pictures).
// Stored in the private "files" Supabase Storage bucket under the owner's user id (supabase/files.sql).

import type { SupabaseClient } from "@supabase/supabase-js";

export const FILES_BUCKET = "files";
export const FILE_MAX_BYTES = 25 * 1024 * 1024;

export type ScrapFile = { path: string; name: string; size: number; type: string; added_at: string };

// Before supabase/files.sql is run there's no files column or bucket.
export const FILES_SETUP =
  "Files can't be added yet. In Supabase, open SQL Editor and run the file supabase/files.sql once, then reload.";
export const isFilesSetupError = (message: string) => /files|bucket|not found|schema cache|column/i.test(message);

// The kinds of file the AI can read. Videos are those kept on the person's computer.
export function aiReadable(file: { name: string; type: string }) {
  return /^(application\/pdf|text\/plain|text\/markdown|image\/(png|jpeg|webp)|video\/[\w.+-]+)$/.test(fileType(file));
}

// Videos up to this size can go through Supabase, in pieces, when the browser can't send them
// to Google directly. Bigger ones would take too long for one request to pass on.
export const BACKUP_MAX_BYTES = 300 * 1024 * 1024;

// The browser sometimes leaves the type empty; go by the name then.
export function fileType(file: { name: string; type: string }) {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return (
    {
      pdf: "application/pdf",
      txt: "text/plain",
      md: "text/markdown",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
      gif: "image/gif",
      heic: "image/heic",
      mp4: "video/mp4",
      mov: "video/quicktime",
      webm: "video/webm",
    } as Record<string, string>
  )[ext] ?? "application/octet-stream";
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export async function uploadScrapFile(supabase: SupabaseClient, file: File): Promise<ScrapFile> {
  if (file.size > FILE_MAX_BYTES) throw new Error(`"${file.name}" is bigger than 25 MB.`);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You're signed out. Sign in again to add files.");
  const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-100) || "file";
  const path = `${user.id}/${crypto.randomUUID()}/${safe}`;
  const type = fileType(file);
  const { error } = await supabase.storage.from(FILES_BUCKET).upload(path, file, { contentType: type });
  if (error) throw new Error(isFilesSetupError(error.message) ? FILES_SETUP : error.message);
  return { path, name: file.name, size: file.size, type, added_at: new Date().toISOString() };
}

// A link that opens the file for an hour.
export async function fileLink(supabase: SupabaseClient, path: string, download = false) {
  const { data, error } = await supabase.storage.from(FILES_BUCKET).createSignedUrl(path, 3600, download ? { download: true } : undefined);
  if (error || !data) throw new Error("The file couldn't be opened. Try again.");
  return data.signedUrl;
}

// Videos kept on the computer ("local/…") have nothing stored, so only the rest are removed.
export async function deleteScrapFiles(supabase: SupabaseClient, paths: string[]) {
  const stored = paths.filter((p) => !p.startsWith("local/"));
  if (!stored.length) return;
  await supabase.storage.from(FILES_BUCKET).remove(stored);
}
