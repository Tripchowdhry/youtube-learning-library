"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArticleNote, SectionSwitch, formatDate } from "@/components/ReadingLibrary";
import ContextMenu, { type MenuState } from "@/components/ContextMenu";
import { FolderSortSelect, compareFolders, sortHint, useFolderSort } from "@/components/FolderSort";
import VideoThumb from "@/components/VideoThumb";
import { createClient } from "@/lib/supabase/client";
import type { Folder, Video } from "@/lib/types";
import { askVideoAi } from "@/lib/video-ai";

type View = { kind: "all" } | { kind: "unsorted" } | { kind: "folder"; id: string };

const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position;

export default function Library({ userEmail }: { userEmail: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [folders, setFolders] = useState<Folder[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const videosRef = useRef(videos);
  videosRef.current = videos;
  const [aiNoteIds, setAiNoteIds] = useState<Set<string>>(new Set());
  const [aiNoteErrors, setAiNoteErrors] = useState<Map<string, string>>(new Map());
  const [notedVideoIds, setNotedVideoIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>({ kind: "all" });
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const [showFolders, setShowFolders] = useState(false);
  const [folderSort, setFolderSort] = useFolderSort();
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
      folders.filter((f) => f.parent_id === parentId).sort(compareFolders(folderSort)),
    [folders, folderSort],
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
        [v.title, v.channel, v.note, folderPath(v.folder_id), ...v.tags].some((s) => s?.toLowerCase().includes(q)),
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

    // A video that's already saved isn't added twice: it gets today's date and moves to the top of its folder.
    const existing = videos.find((v) => v.youtube_id === info.youtube_id);
    if (existing) {
      const siblings = videos.filter((v) => v.folder_id === existing.folder_id && v.id !== existing.id);
      const position = siblings.length ? Math.min(...siblings.map((v) => v.position)) - 1 : 0;
      updateVideo(existing.id, { created_at: new Date().toISOString(), position });
      notify(`Already saved in ${existing.folder_id ? folderPath(existing.folder_id) : "Unsorted"}. Moved it to the top.`);
      return true;
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
    writeAiNote(data as Video);
    return true;
  }

  // Asks the AI to watch the video and fill in its note. New videos do this on their own; if
  // it fails, the reason shows on the video's row until the next try.
  async function writeAiNote(video: Video) {
    setAiNoteIds((prev) => new Set(prev).add(video.id));
    setAiNoteErrors((prev) => {
      const next = new Map(prev);
      next.delete(video.id);
      return next;
    });
    const result = await askVideoAi({ youtubeId: video.youtube_id, title: video.title, task: "note" });
    setAiNoteIds((prev) => {
      const next = new Set(prev);
      next.delete(video.id);
      return next;
    });
    if (result.error) {
      if (result.code === "no-key") return;
      setAiNoteErrors((prev) => new Map(prev).set(video.id, result.error!));
      return;
    }
    // Don't replace a note typed while the AI was working.
    const current = videosRef.current.find((v) => v.id === video.id);
    if (current && !current.note && result.text) updateVideo(video.id, { note: result.text });
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

  // Drop one folder onto another next to it: it takes that folder's place, and the rest are renumbered so the order sticks.
  async function moveFolderTo(draggedId: string, targetId: string) {
    const dragged = folders.find((f) => f.id === draggedId);
    const target = folders.find((f) => f.id === targetId);
    if (!dragged || !target || dragged.id === target.id || dragged.parent_id !== target.parent_id) return;
    const siblings = childFolders(dragged.parent_id).filter((f) => f.id !== dragged.id);
    const index = siblings.findIndex((f) => f.id === target.id);
    const draggedIndex = childFolders(dragged.parent_id).findIndex((f) => f.id === dragged.id);
    // Dragging down puts it after the target; dragging up puts it before.
    siblings.splice(draggedIndex <= index ? index + 1 : index, 0, dragged);
    const changed = siblings.map((f, position) => ({ id: f.id, position })).filter((f, i) => siblings[i].position !== f.position);
    setFolders((prev) => prev.map((f) => ({ ...f, position: changed.find((c) => c.id === f.id)?.position ?? f.position })));
    const results = await Promise.all(
      changed.map((c) => supabase.from("folders").update({ position: c.position }).eq("id", c.id)),
    );
    const failed = results.find((r) => r.error);
    if (failed) {
      notify(failed.error!.message, true);
      load();
    }
  }

  function openFolderMenu(folder: Folder, e: React.MouseEvent) {
    e.preventDefault();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: "✏️ Rename", onClick: () => renameFolder(folder) },
        { label: "📁 New subfolder", onClick: () => createFolder(folder.id) },
        { label: "🗑 Delete", onClick: () => deleteFolder(folder), danger: true },
      ],
    });
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
        <span className="hidden text-lg font-bold sm:inline">📚 Learning Library</span>
        <SectionSwitch active="videos" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search titles, channels, notes…"
          className="ml-auto w-full max-w-xs rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <Link
          href="/clips"
          className="shrink-0 rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
          title="See and delete your clips to free up space"
        >
          🗂 Clips
        </Link>
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
            onDrop={() => draggingId && moveVideo(draggingId, null)}
          />

          <div className="mt-4 mb-1 flex items-center justify-between px-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Folders
            <FolderSortSelect sort={folderSort} onChange={setFolderSort} />
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
            draggingFolder={folders.find((f) => f.id === draggingFolderId) ?? null}
            onFolderDragStart={setDraggingFolderId}
            onFolderDragEnd={() => setDraggingFolderId(null)}
            onDropFolder={(targetId) => draggingFolderId && moveFolderTo(draggingFolderId, targetId)}
            canDragFolders={folderSort === "custom"}
            onFolderMenu={openFolderMenu}
          />
          {childFolders(null).length > 1 && (
            <p className="mt-3 px-2 text-xs text-slate-400">{sortHint(folderSort, "folders")}</p>
          )}

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
                  Tip: use ▲ ▼ on a video, or drag it onto another, to change the order. Drop it on a folder to move it.
                </p>
              )}
              {!canReorder && visibleVideos.length > 1 && (
                <p className="mb-3 text-xs text-slate-500">
                  {searching ? "Search results" : "All videos"} show the newest first. To change the order, open a folder
                  on the left.
                </p>
              )}
              <div className="flex flex-col gap-2">
                {visibleVideos.map((video, index) => (
                  <VideoCard
                    key={video.id}
                    video={video}
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
                    onSaveNote={(note) => updateVideo(video.id, { note })}
                    aiNoteBusy={aiNoteIds.has(video.id)}
                    aiNoteError={aiNoteErrors.get(video.id) ?? null}
                    onAiNote={() => writeAiNote(video)}
                    onDelete={() => deleteVideo(video)}
                    onTagClick={(tag) => setQuery(tag)}
                  />
                ))}
              </div>
            </>
          )}
        </main>
      </div>

      {menu && <ContextMenu menu={menu} onClose={closeMenu} />}

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
  onDrop?: () => void;
  indent?: number;
  leading?: React.ReactNode;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      draggable={Boolean(props.onDragStart)}
      onDragStart={(e) => {
        if (!props.onDragStart) return;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", props.label);
        props.onDragStart();
      }}
      onDragEnd={props.onDragEnd}
      onContextMenu={props.onContextMenu}
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
        props.onDrop?.();
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
  draggingFolder: Folder | null;
  onFolderDragStart: (id: string) => void;
  onFolderDragEnd: () => void;
  onDropFolder: (targetId: string) => void;
  canDragFolders: boolean;
  onFolderMenu: (folder: Folder, e: React.MouseEvent) => void;
}) {
  const { draggingFolder } = props;
  const inTree = (folderId: string | null, rootId: string): boolean =>
    folderId === rootId || props.childFolders(rootId).some((f) => inTree(folderId, f.id));
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
              // A top-level folder counts the videos in all its subfolders too; a subfolder counts only its own.
              count={props.videos.filter((v) => (props.depth === 0 ? inTree(v.folder_id, folder.id) : v.folder_id === folder.id)).length}
              active={props.activeId === folder.id}
              onClick={() => props.onOpen(folder.id)}
              indent={props.depth}
              // A dragged video drops into the folder; a dragged folder reorders among folders next to it.
              dropTarget={
                props.draggingId !== null ||
                (draggingFolder !== null && draggingFolder.id !== folder.id && draggingFolder.parent_id === folder.parent_id)
              }
              onDrop={() => (draggingFolder ? props.onDropFolder(folder.id) : props.onDropVideo(folder.id))}
              onDragStart={props.canDragFolders ? () => props.onFolderDragStart(folder.id) : undefined}
              onDragEnd={props.onFolderDragEnd}
              onContextMenu={(e) => props.onFolderMenu(folder, e)}
              leading={
                <button
                  onClick={toggle}
                  className={`w-9 shrink-0 text-4xl leading-none ${hasChildren ? "" : "invisible"}`}
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
  onSaveNote: (note: string) => void;
  aiNoteBusy: boolean;
  aiNoteError: string | null;
  onAiNote: () => void;
  onDelete: () => void;
  onTagClick: (tag: string) => void;
}) {
  const { video } = props;
  const [over, setOver] = useState(false);
  const [editingNote, setEditingNote] = useState(false);

  return (
    <div
      draggable={!editingNote}
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
      className={`flex gap-3 rounded-xl border bg-white p-3 shadow-sm transition ${props.dragging ? "opacity-40" : ""} ${over ? "border-blue-500 ring-2 ring-blue-500" : "border-slate-200"}`}
    >
      <div className="w-28 shrink-0 cursor-grab overflow-hidden rounded-lg sm:w-48">
        <VideoThumb video={video} href={`/video/${video.id}`} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <a href={`/video/${video.id}`} className="line-clamp-2 font-medium hover:underline" draggable={false}>
          {video.title}
        </a>
        <p className="text-xs text-slate-500">
          {video.channel && `${video.channel} · `}Added {formatDate(video.created_at)}
        </p>
        <ArticleNote note={video.note} editing={editingNote} setEditing={setEditingNote} onSave={props.onSaveNote} />
        {props.aiNoteError && !video.note && (
          <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700 ring-1 ring-red-200">⚠️ {props.aiNoteError}</p>
        )}
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
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <a
            href={`/video/${video.id}`}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
            draggable={false}
          >
            ✏️ {props.hasNotes ? "Open notes" : "Take notes"}
          </a>
          <a
            href={video.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
            draggable={false}
          >
            YouTube ↗
          </a>
          <select
            value={video.folder_id ?? ""}
            onChange={(e) => props.onMove(e.target.value || null)}
            className="max-w-48 min-w-0 rounded-md border border-slate-300 bg-white px-1 py-1 text-xs"
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
              <SmallButton onClick={() => props.onShift!(-1)} disabled={props.isFirst} title="Move up">
                ▲
              </SmallButton>
              <SmallButton onClick={() => props.onShift!(1)} disabled={props.isLast} title="Move down">
                ▼
              </SmallButton>
            </>
          )}
          {!video.note && !editingNote && <SmallButton onClick={() => setEditingNote(true)}>📝 Add note</SmallButton>}
          {video.note && !editingNote && (
            <SmallButton
              onClick={() => {
                if (window.confirm("Clear this video's note?")) props.onSaveNote("");
              }}
            >
              🧹 Clear note
            </SmallButton>
          )}
          {!video.note && !editingNote && !props.aiNoteBusy && (
            <SmallButton onClick={props.onAiNote} title="Let AI watch the video and write the note">
              ✨ AI note
            </SmallButton>
          )}
          {!video.note && props.aiNoteBusy && <AiNoteWorking />}
          <SmallButton onClick={props.onEditTags}>Tags</SmallButton>
          <SmallButton onClick={props.onDelete} danger>
            🗑 Delete
          </SmallButton>
        </div>
      </div>
    </div>
  );
}

// Shown in place of the ✨ AI note button while the AI watches the video.
function AiNoteWorking() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <span className="flex items-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-xs text-violet-800">
      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-violet-300 border-t-violet-700" />
      Writing note… {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
    </span>
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
