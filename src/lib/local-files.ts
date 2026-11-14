"use client";

// Files that stay on the person's computer (PDFs, pictures, documents, videos). The ScrapBook
// page keeps only their name and size; the file itself is read from the computer when it's
// opened or sent to the AI.
// Chrome and Edge can remember the file (with the person's OK each visit). Other browsers,
// and iPads, need the file picked again after the page is reloaded.

import { fileType, type ScrapFile } from "@/lib/files";

export const LOCAL_PREFIX = "local/";
export const isLocalFile = (f: { path: string }) => f.path.startsWith(LOCAL_PREFIX);

// Files picked during this visit.
const picked = new Map<string, File>();

export type FileHandle = {
  getFile(): Promise<File>;
  queryPermission?(o: { mode: "read" }): Promise<PermissionState>;
  requestPermission?(o: { mode: "read" }): Promise<PermissionState>;
};
export type PickerWindow = Window & {
  showOpenFilePicker?: (o: object) => Promise<FileHandle[]>;
};

const DB = "brainshelf-local-files";
const STORE = "handles";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  try {
    const db = await openDb();
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Storage can be blocked (private browsing); the file is then just picked again later.
    return undefined;
  }
}

function pickWithInput(multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.oncancel = () => resolve([]);
    input.click();
  });
}

// Keeps a chosen file on the computer: the page stores only its name, size and type.
export async function rememberLocalFile(file: File, handle?: FileHandle): Promise<ScrapFile> {
  const path = `${LOCAL_PREFIX}${crypto.randomUUID()}`;
  picked.set(path, file);
  if (handle) await withStore("readwrite", (s) => s.put(handle, path));
  return { path, name: file.name, size: file.size, type: fileType(file), added_at: new Date().toISOString() };
}

export const isVideo = (file: { name: string; type: string }) =>
  file.type.startsWith("video/") || /\.(mp4|mov|m4v|webm|avi|mpe?g|wmv|3gp)$/i.test(file.name);

// The video on this computer, if it can be reached without asking: picked this visit, or
// remembered by Chrome or Edge with permission already given.
export async function localFileNow(path: string): Promise<File | null> {
  const known = picked.get(path);
  if (known) return known;
  const handle = await withStore<FileHandle>("readonly", (s) => s.get(path));
  if (!handle?.queryPermission) return null;
  try {
    if ((await handle.queryPermission({ mode: "read" })) !== "granted") return null;
    const file = await handle.getFile();
    picked.set(path, file);
    return file;
  } catch {
    return null;
  }
}

// The file on this computer, asking the person if needed. Must run from a click.
// beforePick runs just before a file picker opens, to say which file to choose.
// Returns null when they cancel or the file is gone.
export async function findLocalFile(f: ScrapFile, beforePick?: () => void): Promise<File | null> {
  const known = picked.get(f.path);
  if (known) return known;
  const w = window as PickerWindow;
  // Browsers without Chrome's picker (Safari, iPad) can't remember files, and only open a
  // picker straight from the click, so open it before anything else.
  if (!w.showOpenFilePicker) {
    beforePick?.();
    const [file] = await pickWithInput(false);
    if (!file) return null;
    picked.set(f.path, file);
    return file;
  }
  const now = await localFileNow(f.path);
  if (now) return now;
  const handle = await withStore<FileHandle>("readonly", (s) => s.get(f.path));
  if (handle?.requestPermission) {
    try {
      if ((await handle.requestPermission({ mode: "read" })) === "granted") {
        const file = await handle.getFile();
        picked.set(f.path, file);
        return file;
      }
    } catch {
      // Moved or deleted on the computer: pick it again below.
    }
  }
  beforePick?.();
  try {
    const [again] = await w.showOpenFilePicker({ multiple: false });
    const file = await again.getFile();
    picked.set(f.path, file);
    await withStore("readwrite", (s) => s.put(again, f.path));
    return file;
  } catch {
    return null;
  }
}

export async function forgetLocalFile(path: string) {
  picked.delete(path);
  await withStore("readwrite", (s) => s.delete(path));
}
