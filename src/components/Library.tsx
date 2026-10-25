"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import VideoThumb from "@/components/VideoThumb";
import { createClient } from "@/lib/supabase/client";
import type { Folder, Video } from "@/lib/types";

type View = { kind: "all" } | { kind: "unsorted" } | { kind: "folder"; id: string };

const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position;

export default function Library({ userEmail }: { userEmail: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [folders, setFolders] = useState<Folder[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [notedVideoIds, setNotedVideoIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>({ kind: "all" });
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [showFolders, setShowFolders] = useState(false);
  const [toast, setToast] = useState<{ text: string; isError?: boolean } | null>(null);

  const notify = useCallback((text: string, isError = false) => {
    setToast({ text, isError });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    const [f, v, n] = await Promise.all([
      supabase.from("folders").select("*").order("position").order("name"),
      supabase.from("videos").select("*").order("position"),
      supabase.from("notes").select("video_id"),
    ]);
    // Notes are optional: ignore errors so the library still loads before the notes table exists.
    if (!n.error) setNotedVideoIds(new Set(n.data.map((row) => row.video_id as string)));
    if (f.error || v.error) {
      notify((f.error ?? v.error)!.message, true);
    } else {
      setFolders(f.data as Folder[]);
      setVideos(v.data as Video[]);
    }
    setLoading(false);
  }, [supabase, notify]);

  useEffect(() => {
    load();
  }, [load]);

  // ---------- Folder helpers ----------

  const childFolders = useCallback(
    (parentId: string | null) =>
      folders.filter((f) => f.parent_id === parentId).sort((a, b) => byPosition(a, b) || a.name.localeCompare(b.name)),
    [folders],
  );

  const folderPath = useCallback(
    (id: string | null): string => {
      const names: string[] = [];
      let current = folders.find((f) => f.id === id);
      while (current) {
        names.unshift(current.name);
        current = folders.find((f) => f.id === current!.parent_id);
      }
      return names.join(" › ");
    },
    [folders],
  );

  // Every folder, in tree order, for the "Move to" menus.
  const folderOptions = useMemo(() => {
    const out: { id: string; label: string }[] = [];
    const walk = (parentId: string | null, depth: number) => {
      for (const f of childFolders(parentId)) {
        out.push({ id: f.id, label: `${"  ".repeat(depth)}${f.name}` });
        walk(f.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }, [childFolders]);

  const currentFolder = view.kind === "folder" ? folders.find((f) => f.id === view.id) ?? null : null;
  const currentFolderId = view.kind === "folder" ? view.id : null;

  // ---------- Which videos to show ----------

  const searching = query.trim().length > 0;
  const canReorder = !searching && view.kind !== "all";

  const visibleVideos = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      return videos.filter((v) =>
        [v.title, v.channel, folderPath(v.folder_id), ...v.tags].some((s) => s?.toLowerCase().includes(q)),
      );
    }
    if (view.kind === "all") return [...videos].sort((a, b) => b.created_at.localeCompare(a.created_at));
    const folderId = view.kind === "folder" ? view.id : null;
    return videos.filter((v) => v.folder_id === folderId).sort(byPosition);
  }, [videos, view, query, folderPath]);

  const nextPosition = (folderId: string | null) => {
    const siblings = videos.filter((v) => v.folder_id === folderId);
    return siblings.length ? Math.max(...siblings.map((v) => v.position)) + 1 : 0;
  };

  // ---------- Video actions ----------

  async function addVideo(link: string) {
    const res = await fetch(`/api/video-info?url=${encodeURIComponent(link)}`);
    const info = await res.json();
    if (!res.ok) {
      notify(info.error ?? "Couldn't read that link.", true);
      return false;
    }

    const existing = videos.find((v) => v.youtube_id === info.youtube_id);
    if (existing) {
      notify(`Already saved in ${existing.folder_id ? folderPath(existing.folder_id) : "Unsorted"}.`, true);
      return false;
    }

    // Inside a folder, the video goes there. Otherwise it goes into its channel's folder.
    let folderId = currentFolderId;
    let newFolder: Folder | null = null;
    if (!folderId && info.channel) {
      const picked = await channelFolder(info.channel);
      if (!picked) return false;
      folderId = picked.id;
      if (!folders.some((f) => f.id === picked.id)) newFolder = picked;
    }

    const { data, error } = await supabase
      .from("videos")
      .insert({ ...info, folder_id: folderId, position: nextPosition(folderId) })
      .select()
      .single();
    if (error) {
      notify(error.message, true);
      return false;
    }
    if (newFolder) setFolders((prev) => [...prev, newFolder!]);
    setVideos((prev) => [...prev, data as Video]);
    notify(folderId && !currentFolderId ? `Saved to ${info.channel}` : `Saved "${info.title}"`);
    return true;
  }

  // Finds the top-level folder named after a channel, creating it the first time.
  async function channelFolder(channel: string): Promise<Folder | null> {
    const name = channel.trim().slice(0, 100);
    const existing = folders.find((f) => f.parent_id === null && f.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;

    const topLevel = folders.filter((f) => f.parent_id === null);
    const position = topLevel.length ? Math.max(...topLevel.map((f) => f.position)) + 1 : 0;
    const { data, error } = await supabase
      .from("folders")
      .insert({ name, parent_id: null, position })
      .select()
      .single();
    if (error) {
      notify(error.message, true);
      return null;
    }
    return data as Folder;
  }

  async function updateVideo(id: string, changes: Partial<Video>) {
    setVideos((prev) => prev.map((v) => (v.id === id ? { ...v, ...changes } : v)));
    const { error } = await supabase.from("videos").update(changes).eq("id", id);
    if (error) {
      notify(error.message, true);
      load();
    }
  }

  function moveVideo(id: string, folderId: string | null) {
    const video = videos.find((v) => v.id === id);
    if (!video || video.folder_id === folderId) return;
    updateVideo(id, { folder_id: folderId, position: nextPosition(folderId) });
    notify(`Moved to ${folderId ? folderPath(folderId) : "Unsorted"}`);
  }

  // Drop one video onto another: it takes the target's place in the list.
  function reorderVideo(draggedId: string, targetId: string) {
    if (draggedId === targetId) return;
    const list = visibleVideos.filter((v) => v.id !== draggedId);
    const index = list.findIndex((v) => v.id === targetId);
    if (index === -1) return;
    const target = list[index];
    const before = list[index - 1];
    const position = before ? (before.position + target.position) / 2 : target.position - 1;
    updateVideo(draggedId, { position, folder_id: target.folder_id });
  }

  // Swap a video with its neighbor: -1 moves it earlier, +1 later.
  function shiftVideo(id: string, step: -1 | 1) {
    const index = visibleVideos.findIndex((v) => v.id === id);
    const neighbor = visibleVideos[index + step];
    if (index === -1 || !neighbor) return;
    const video = visibleVideos[index];
    if (video.position === neighbor.position) {
      // Equal positions can't be swapped, so nudge just past the neighbor instead.
      updateVideo(video.id, { position: neighbor.position + step * 0.5 });
      return;
    }
    updateVideo(video.id, { position: neighbor.position });
    updateVideo(neighbor.id, { position: video.position });
  }

  function editTags(video: Video) {
    const answer = window.prompt("Tags, separated by commas:", video.tags.join(", "));
    if (answer === null) return;
    const tags = Array.from(new Set(answer.split(",").map((t) => t.trim()).filter(Boolean)));
    updateVideo(video.id, { tags });
  }

  async function deleteVideo(video: Video) {
    if (!window.confirm(`Remove "${video.title}" from your library?`)) return;
    setVideos((prev) => prev.filter((v) => v.id !== video.id));
    const { error } = await supabase.from("videos").delete().eq("id", video.id);
    if (error) {
      notify(error.message, true);
      load();
    }
  }

  // ---------- Folder actions ----------

  async function createFolder(parentId: string | null) {
    const name = window.prompt(parentId ? `New folder inside "${folderPath(parentId)}":` : "New folder name:");
    if (!name?.trim()) return;
    const siblings = folders.filter((f) => f.parent_id === parentId);
    const position = siblings.length ? Math.max(...siblings.map((f) => f.position)) + 1 : 0;
    const { data, error } = await supabase
      .from("folders")
      .insert({ name: name.trim(), parent_id: parentId, position })
      .select()
      .single();
    if (error) return notify(error.message, true);
    setFolders((prev) => [...prev, data as Folder]);
    if (parentId) setExpanded((prev) => new Set(prev).add(parentId));
    setView({ kind: "folder", id: (data as Folder).id });
  }

  async function renameFolder(folder: Folder) {
    const name = window.prompt("Rename folder:", folder.name);
    if (!name?.trim() || name.trim() === folder.name) return;
    setFolders((prev) => prev.map((f) => (f.id === folder.id ? { ...f, name: name.trim() } : f)));
    const { error } = await supabase.from("folders").update({ name: name.trim() }).eq("id", folder.id);
    if (error) {
      notify(error.message, true);
      load();
    }
  }

  async function deleteFolder(folder: Folder) {
    const ok = window.confirm(
      `Delete "${folder.name}" and any folders inside it?\nThe videos inside will move to Unsorted, not be deleted.`,
    );
    if (!ok) return;
    const { error } = await supabase.from("folders").delete().eq("id", folder.id);
    if (error) return notify(error.message, true);
    setView({ kind: "all" });
    load();
  }

  async function toggleShare(folder: Folder) {
    if (folder.share_token) {
      if (!window.confirm("Turn off the share link? People with the old link won't be able to see it anymore.")) return;
      const { error } = await supabase.from("folders").update({ share_token: null }).eq("id", folder.id);
      if (error) return notify(error.message, true);
      setFolders((prev) => prev.map((f) => (f.id === folder.id ? { ...f, share_token: null } : f)));
      notify("Sharing turned off");
      return;
    }
    const token = crypto.randomUUID();
    const { error } = await supabase.from("folders").update({ share_token: token }).eq("id", folder.id);
    if (error) return notify(error.message, true);
    setFolders((prev) => prev.map((f) => (f.id === folder.id ? { ...f, share_token: token } : f)));
    copyShareLink(token);
  }

  async function copyShareLink(token: string) {
    const link = `${window.location.origin}/share/${token}`;
    try {
      await navigator.clipboard.writeText(link);
      notify("Share link copied. Anyone with it can view this folder.");
    } catch {
      window.prompt("Copy this share link:", link);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.refresh();
  }

  function openView(next: View) {
    setView(next);
    setQuery("");
    setShowFolders(false);
  }

  // ---------- Render ----------

  const title = searching
    ? `Search results for "${query.trim()}"`
    : view.kind === "all"
      ? "All videos"
      : view.kind === "unsorted"
        ? "Unsorted"
        : folderPath(view.id);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <button
          className="rounded-md border border-slate-300 px-2 py-1 text-sm md:hidden"
          onClick={() => setShowFolders((s) => !s)}
        >
          {showFolders ? "Close" : "Folders"}
        </button>
        <span className="text-lg font-bold">📚 Learning Library</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search titles, channels, tags…"
          className="ml-auto w-full max-w-xs rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <div className="hidden items-center gap-2 text-sm text-slate-500 sm:flex">
          <span className="max-w-40 truncate">{userEmail}</span>
          <button onClick={signOut} className="rounded-md px-2 py-1 hover:bg-slate-100">
            Sign out
          </button>
        </div>
      </header>

      <div className="flex flex-1">
        <aside
          className={`${showFolders ? "fixed inset-x-0 top-[57px] bottom-0 z-10 block" : "hidden"} w-full overflow-y-auto border-r border-slate-200 bg-white p-3 md:sticky md:top-[57px] md:block md:h-[calc(100vh-57px)] md:w-72`}
        >
          <NavItem label="🗂️ All videos" count={videos.length} active={view.kind === "all" && !searching} onClick={() => openView({ kind: "all" })} />
          <NavItem
            label="📥 Unsorted"
            count={videos.filter((v) => !v.folder_id).length}
            active={view.kind === "unsorted" && !searching}
            onClick={() => openView({ kind: "unsorted" })}
            dropTarget={draggingId !== null}
            onDropVideo={() => draggingId && moveVideo(draggingId, null)}
          />

          <div className="mt-4 mb-1 flex items-center justify-between px-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Folders
            <button onClick={() => createFolder(null)} className="rounded px-1.5 text-base text-slate-700 hover:bg-slate-100" title="New folder">
              +
            </button>
          </div>
          {childFolders(null).length === 0 && (
            <p className="px-2 text-sm text-slate-500">No folders yet. Click + to make one, like &quot;LLMs&quot; or &quot;Agents&quot;.</p>
          )}
          <FolderTree
            parentId={null}
            depth={0}
            childFolders={childFolders}
            videos={videos}
            expanded={expanded}
            setExpanded={setExpanded}
            activeId={!searching && view.kind === "folder" ? view.id : null}
            onOpen={(id) => openView({ kind: "folder", id })}
            draggingId={draggingId}
            onDropVideo={(folderId) => draggingId && moveVideo(draggingId, folderId)}
          />

          <button onClick={signOut} className="mt-6 px-2 text-sm text-slate-500 underline sm:hidden">
            Sign out
          </button>
        </aside>

        <main className="min-w-0 flex-1 p-4 md:p-6">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h1 className="mr-auto text-2xl font-bold">{title}</h1>
            {currentFolder && !searching && (
              <>
                <SmallButton onClick={() => createFolder(currentFolder.id)}>+ Subfolder</SmallButton>
                <SmallButton onClick={() => renameFolder(currentFolder)}>Rename</SmallButton>
                <SmallButton onClick={() => toggleShare(currentFolder)}>
                  {currentFolder.share_token ? "Stop sharing" : "Share"}
                </SmallButton>
                {currentFolder.share_token && (
                  <SmallButton onClick={() => copyShareLink(currentFolder.share_token!)}>Copy link</SmallButton>
                )}
                <SmallButton onClick={() => deleteFolder(currentFolder)} danger>
                  Delete
                </SmallButton>
              </>
            )}
          </div>

          {!searching && (
            <AddVideoForm
              onAdd={addVideo}
              destination={view.kind === "folder" ? folderPath(view.id) : null}
            />
          )}

          {currentFolder && !searching && childFolders(currentFolder.id).length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {childFolders(currentFolder.id).map((f) => (
                <button
                  key={f.id}
                  onClick={() => openView({ kind: "folder", id: f.id })}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm hover:bg-slate-50"
                >
                  📁 {f.name}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <p className="text-slate-500">Loading your library…</p>
          ) : visibleVideos.length === 0 ? (
            <EmptyState searching={searching} hasVideos={videos.length > 0} />
          ) : (
            <>
              {canReorder && visibleVideos.length > 1 && (
                <p className="mb-3 text-xs text-slate-500">
                  Tip: use ◀ ▶ on a video, or drag it onto another, to change the order. Drop it on a folder to move it.
                </p>
              )}
              {!canReorder && visibleVideos.length > 1 && (
                <p className="mb-3 text-xs text-slate-500">
                  {searching ? "Search results" : "All videos"} show the newest first. To change the order, open a folder
                  on the left.
                </p>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {visibleVideos.map((video, index) => (
                  <VideoCard
                    key={video.id}
                    video={video}
                    folderLabel={view.kind === "all" || searching ? folderPath(video.folder_id) || "Unsorted" : null}
                    folderOptions={folderOptions}
                    hasNotes={notedVideoIds.has(video.id)}
                    canReorder={canReorder}
                    dragging={draggingId === video.id}
                    onDragStart={() => setDraggingId(video.id)}
                    onDragEnd={() => setDraggingId(null)}
                    onDropOnto={() => draggingId && reorderVideo(draggingId, video.id)}
                    onShift={canReorder ? (step) => shiftVideo(video.id, step) : null}
                    isFirst={index === 0}
                    isLast={index === visibleVideos.length - 1}
                    onMove={(folderId) => moveVideo(video.id, folderId)}
                    onEditTags={() => editTags(video)}
                    onDelete={() => deleteVideo(video)}
                    onTagClick={(tag) => setQuery(tag)}
                  />
                ))}
              </div>
            </>
          )}
        </main>
      </div>

      {toast && (
        <div
          className={`fixed bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-lg px-4 py-2 text-sm text-white shadow-lg ${toast.isError ? "bg-red-600" : "bg-slate-900"}`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

// ---------- Pieces ----------

function NavItem(props: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  dropTarget?: boolean;
  onDropVideo?: () => void;
  indent?: number;
  leading?: React.ReactNode;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={`flex items-center rounded-md text-sm ${props.active ? "bg-slate-900 text-white" : "hover:bg-slate-100"} ${over ? "ring-2 ring-blue-500" : ""}`}
      style={{ paddingLeft: (props.indent ?? 0) * 14 }}
      onDragOver={(e) => {
        if (!props.dropTarget) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        props.onDropVideo?.();
      }}
    >
      {props.leading}
      <button onClick={props.onClick} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left">
        <span className="truncate">{props.label}</span>
        {props.count !== undefined && (
          <span className={`ml-auto text-xs ${props.active ? "text-slate-300" : "text-slate-400"}`}>{props.count}</span>
        )}
      </button>
    </div>
  );
}

function FolderTree(props: {
  parentId: string | null;
  depth: number;
  childFolders: (parentId: string | null) => Folder[];
  videos: Video[];
  expanded: Set<string>;
  setExpanded: React.Dispatch<React.SetStateAction<Set<string>>>;
  activeId: string | null;
  onOpen: (id: string) => void;
  draggingId: string | null;
  onDropVideo: (folderId: string) => void;
}) {
  return (
    <>
      {props.childFolders(props.parentId).map((folder) => {
        const hasChildren = props.childFolders(folder.id).length > 0;
        const isOpen = props.expanded.has(folder.id);
        const toggle = () =>
          props.setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(folder.id)) next.delete(folder.id);
            else next.add(folder.id);
            return next;
          });
        return (
          <div key={folder.id}>
            <NavItem
              label={`${folder.share_token ? "🔗" : "📁"} ${folder.name}`}
              count={props.videos.filter((v) => v.folder_id === folder.id).length}
              active={props.activeId === folder.id}
              onClick={() => props.onOpen(folder.id)}
              indent={props.depth}
              dropTarget={props.draggingId !== null}
              onDropVideo={() => props.onDropVideo(folder.id)}
              leading={
                <button
                  onClick={toggle}
                  className={`w-5 shrink-0 text-xs ${hasChildren ? "" : "invisible"}`}
                  aria-label={isOpen ? "Collapse" : "Expand"}
                >
                  {isOpen ? "▾" : "▸"}
                </button>
              }
            />
            {hasChildren && isOpen && <FolderTree {...props} parentId={folder.id} depth={props.depth + 1} />}
          </div>
        );
      })}
    </>
  );
}

function AddVideoForm({ onAdd, destination }: { onAdd: (link: string) => Promise<boolean>; destination: string | null }) {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!link.trim()) return;
    setBusy(true);
    if (await onAdd(link.trim())) setLink("");
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="mb-5 flex flex-col gap-2 sm:flex-row">
      <input
        value={link}
        onChange={(e) => setLink(e.target.value)}
        placeholder="Paste a YouTube link…"
        className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2"
      />
      <button
        disabled={busy}
        className="rounded-md bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700 disabled:opacity-60"
      >
        {busy ? "Adding…" : destination ? `Add to ${destination}` : "Add video"}
      </button>
    </form>
  );
}

function VideoCard(props: {
  video: Video;
  folderLabel: string | null;
  folderOptions: { id: string; label: string }[];
  hasNotes: boolean;
  canReorder: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropOnto: () => void;
  onShift: ((step: -1 | 1) => void) | null;
  isFirst: boolean;
  isLast: boolean;
  onMove: (folderId: string | null) => void;
  onEditTags: () => void;
  onDelete: () => void;
  onTagClick: (tag: string) => void;
}) {
  const { video } = props;
  const [over, setOver] = useState(false);

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", video.id);
        props.onDragStart();
      }}
      onDragEnd={props.onDragEnd}
      onDragOver={(e) => {
        if (!props.canReorder) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        props.onDropOnto();
      }}
      className={`flex cursor-grab flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition ${props.dragging ? "opacity-40" : ""} ${over ? "border-blue-500 ring-2 ring-blue-500" : "border-slate-200"}`}
    >
      <VideoThumb video={video} href={`/video/${video.id}`} />
      <div className="flex flex-1 flex-col gap-2 p-3">
        <a href={`/video/${video.id}`} className="line-clamp-2 font-medium hover:underline" draggable={false}>
          {video.title}
        </a>
        {video.channel && <p className="-mt-1 text-sm text-slate-500">{video.channel}</p>}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <a href={`/video/${video.id}`} className="font-medium text-slate-700 hover:underline" draggable={false}>
            ✏️ {props.hasNotes ? "Open notes" : "Take notes"}
          </a>
          <a href={video.url} target="_blank" rel="noreferrer" className="text-slate-500 hover:underline" draggable={false}>
            YouTube ↗
          </a>
        </div>
        {props.folderLabel && <p className="text-xs text-slate-500">📁 {props.folderLabel}</p>}
        {video.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {video.tags.map((tag) => (
              <button
                key={tag}
                onClick={() => props.onTagClick(tag)}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-200"
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
        <div className="mt-auto flex items-center gap-1 pt-1">
          <select
            value={video.folder_id ?? ""}
            onChange={(e) => props.onMove(e.target.value || null)}
            className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-1 py-1 text-xs"
            aria-label="Move to folder"
          >
            <option value="">📥 Unsorted</option>
            {props.folderOptions.map((f) => (
              <option key={f.id} value={f.id}>
                📁 {f.label}
              </option>
            ))}
          </select>
          {props.onShift && (
            <>
              <SmallButton onClick={() => props.onShift!(-1)} disabled={props.isFirst} title="Move earlier">
                ◀
              </SmallButton>
              <SmallButton onClick={() => props.onShift!(1)} disabled={props.isLast} title="Move later">
                ▶
              </SmallButton>
            </>
          )}
          <SmallButton onClick={props.onEditTags}>Tags</SmallButton>
          <SmallButton onClick={props.onDelete} danger>
            ✕
          </SmallButton>
        </div>
      </div>
    </div>
  );
}

function SmallButton({
  children,
  onClick,
  danger,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`rounded-md border px-2 py-1 text-xs disabled:opacity-30 ${danger ? "border-red-200 text-red-600 hover:bg-red-50" : "border-slate-300 text-slate-700 hover:bg-slate-100"}`}
    >
      {children}
    </button>
  );
}

function EmptyState({ searching, hasVideos }: { searching: boolean; hasVideos: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-500">
      {searching
        ? "No videos match your search."
        : hasVideos
          ? "No videos here yet. Paste a link above, or move videos in from another folder."
          : "Your library is empty. Paste a YouTube link above to save your first video."}
    </div>
  );
}
