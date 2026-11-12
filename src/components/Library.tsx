"use client";

import ReportWriterLink from "@/components/ReportWriterLink";
import BrandMark from "@/components/BrandMark";
import { WelcomePanel } from "@/components/GettingStarted";
import { Tour, TourButton, useSectionTour } from "@/components/Tour";
import { SAMPLE_VIDEO } from "@/lib/onboarding";
import { Brush, Clapperboard, ExternalLink, FilePen, Folder as FolderIcon, ArrowUp, Copy, Eye, FolderPlus, Inbox, Link2, Link2Off, NotebookText, Pencil, Sparkles, Trash2, TriangleAlert, type LucideIcon } from "lucide-react";
import { Ico, type Tone } from "@/components/Icon";
import Link from "next/link";
import ClipsIcon from "@/components/ClipsIcon";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePointerDrag } from "@/lib/pointer-drag";
import { useRouter } from "next/navigation";
import {
  AiNoteWorking,
  ArticleNote,
  PERIODS,
  type Period,
  Pills,
  ReadCheck,
  SectionSwitch,
  type Toast,
  ToastBox,
  formatDate,
  SmallButton,
} from "@/components/ReadingLibrary";
import ContextMenu, { type MenuState } from "@/components/ContextMenu";
import {
  FolderSortSelect,
  SidebarHeading,
  ItemSortSelect,
  compareFolders,
  compareItems,
  sortHint,
  useFolderSort,
  useItemSort,
} from "@/components/FolderSort";
import VideoThumb from "@/components/VideoThumb";
import CategoryTag from "@/components/CategoryTag";
import { findSavedElsewhere } from "@/lib/find-saved";
import { createClient } from "@/lib/supabase/client";
import type { VideoCategory, Video } from "@/lib/types";
import { isWithin } from "@/lib/category-tree";
import { onAiJobDone, runAiJob, useAiJobs } from "@/lib/ai-jobs";
import { askVideoAi } from "@/lib/video-ai";
import { askConfirm } from "./ConfirmDialog";

type AiNote = { videoId: string; note: string; model?: string };
const aiNoteKey = (videoId: string) => `note:${videoId}`;

type View = { kind: "all" } | { kind: "unsorted" } | { kind: "folder"; id: string };

export default function Library({ userEmail }: { userEmail: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [folders, setFolders] = useState<VideoCategory[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const videosRef = useRef(videos);
  videosRef.current = videos;
  const aiJobs = useAiJobs();
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
  const [itemSort, setItemSort] = useItemSort();
  const [watchFilter, setWatchFilter] = useState<"all" | "unwatched" | "watched">("all");
  const [period, setPeriod] = useState<Period>("any");
  const [toast, setToast] = useState<Toast | null>(null);
  // The video that was just found as a duplicate, shown with a ring for a few seconds.
  const [flashId, setFlashId] = useState<string | null>(null);

  const notify = useCallback((text: string, isError = false) => {
    setToast({ text, isError });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    const [f, v, n] = await Promise.all([
      supabase.from("video_categories").select("*").order("position").order("name"),
      supabase.from("videos").select("*").order("position"),
      supabase.from("notes").select("video_id"),
    ]);
    // Notes are optional: ignore errors so the library still loads before the notes table exists.
    if (!n.error) setNotedVideoIds(new Set(n.data.map((row) => row.video_id as string)));
    if (f.error || v.error) {
      notify((f.error ?? v.error)!.message, true);
    } else {
      setFolders(f.data as VideoCategory[]);
      setVideos(v.data as Video[]);
    }
    setLoading(false);
  }, [supabase, notify]);

  useEffect(() => {
    load();
  }, [load]);

  // New here: show the short tour once the library has loaded.
  const tour = useSectionTour("videos", !loading, userEmail);

  // ---------- Category helpers ----------

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
  // Dragging to reorder works inside a folder whatever the sort; ▲ ▼ only in your own order.
  const canReorder = !searching && view.kind !== "all";
  const canShift = canReorder && itemSort === "custom";

  const visibleVideos = useMemo(() => {
    const q = query.trim().toLowerCase();
    const folderId = view.kind === "folder" ? view.id : null;
    const shown = q
      ? videos.filter((v) =>
          [v.title, v.channel, v.note, folderPath(v.category_id), ...v.tags].some((s) => s?.toLowerCase().includes(q)),
        )
      : view.kind === "all"
        ? [...videos]
        : videos.filter((v) => v.category_id === folderId);
    const days = PERIODS.find((p) => p.value === period)!.days;
    const since = days ? Date.now() - days * 86_400_000 : 0;
    return shown
      .filter((v) => !since || new Date(v.created_at).getTime() >= since)
      .filter((v) => watchFilter === "all" || (watchFilter === "watched") === Boolean(v.watched_at))
      .sort(compareItems<Video>(itemSort, (v) => v.title ?? "", !q && view.kind !== "all"));
  }, [videos, view, query, folderPath, itemSort, watchFilter, period]);

  // New and moved videos go to the top of their folder.
  const topPosition = (folderId: string | null) => {
    const siblings = videos.filter((v) => v.category_id === folderId);
    return siblings.length ? Math.min(...siblings.map((v) => v.position)) - 1 : 0;
  };

  // ---------- Video actions ----------

  // Points at a saved video: opens its category and rings it in green for a few seconds.
  function pointAt(video: Video) {
    openView(video.category_id ? { kind: "folder", id: video.category_id } : { kind: "unsorted" });
    setPeriod("any");
    setWatchFilter("all");
    setFlashId(video.id);
    setTimeout(() => setFlashId((id) => (id === video.id ? null : id)), 4000);
  }

  function showSaved(video: Video) {
    pointAt(video);
    const where = video.category_id ? folderPath(video.category_id) : "Uncategorized";
    setToast({ text: `Duplicate: this video is already saved here, in Videos › ${where}.`, warn: true });
    setTimeout(() => setToast(null), 8000);
  }

  // Arriving from another tab with ?show=id: point at that saved video.
  const shown = useRef(false);
  useEffect(() => {
    if (loading || shown.current) return;
    shown.current = true;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("show");
    if (!id) return;
    window.history.replaceState(null, "", "/");
    const video = videos.find((v) => v.id === id);
    // ?show=id&find=1 comes from a video's own page: just open its category.
    if (!video) return;
    if (params.get("find")) pointAt(video);
    else showSaved(video);
    // Runs once, when the list first loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  async function addVideo(link: string) {
    // A video already saved in Reading or Tutorials isn't saved again here.
    const elsewhere = await findSavedElsewhere(supabase, [link], "videos");
    if (elsewhere) {
      router.push(elsewhere.href);
      return true;
    }
    const res = await fetch(`/api/video-info?url=${encodeURIComponent(link)}`);
    const info = await res.json();
    if (!res.ok) {
      notify(info.error ?? "Couldn't read that link.", true);
      return false;
    }

    // A video that's already saved isn't added twice: its folder opens and it gets a green ring.
    const existing = videos.find((v) => v.youtube_id === info.youtube_id);
    if (existing) {
      showSaved(existing);
      return true;
    }

    // Inside a folder, the video goes there. Otherwise it goes into its channel's folder.
    let folderId = currentFolderId;
    let newFolder: VideoCategory | null = null;
    if (!folderId && info.channel) {
      const picked = await channelFolder(info.channel);
      if (!picked) return false;
      folderId = picked.id;
      if (!folders.some((f) => f.id === picked.id)) newFolder = picked;
    }

    const { data, error } = await supabase
      .from("videos")
      .insert({ ...info, category_id: folderId, position: topPosition(folderId) })
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
  // it fails, the reason shows on the video's row until the next try. It keeps going, and
  // saves the note, even if the person moves to another tab meanwhile.
  function writeAiNote(video: Video) {
    runAiJob<AiNote>({
      key: aiNoteKey(video.id),
      label: `AI summary for "${video.title ?? "your video"}"`,
      work: async () => {
        const result = await askVideoAi({ youtubeId: video.youtube_id, title: video.title, task: "note" });
        if (result.error) return result.code === "no-key" ? {} : { error: result.error };
        if (!result.text) return {};
        // Only fills an empty note, so a note typed while the AI was working stays.
        const { data, error } = await supabase
          .from("videos")
          .update({ note: result.text })
          .eq("id", video.id)
          .eq("note", "")
          .select("id");
        if (error) return { error: error.message };
        return data.length ? { result: { videoId: video.id, note: result.text, model: result.model } } : {};
      },
    });
  }

  // Shows a finished AI note right away when the library is open.
  useEffect(
    () =>
      onAiJobDone((key, result) => {
        if (!key.startsWith("note:")) return false;
        const { videoId, note, model } = result as AiNote;
        setVideos((prev) => prev.map((v) => (v.id === videoId ? { ...v, note } : v)));
        if (model) notify(`Note written by ${model}`);
        return true;
      }),
    [notify],
  );

  // Finds the top-level folder named after a channel, creating it the first time.
  async function channelFolder(channel: string): Promise<VideoCategory | null> {
    const name = channel.trim().slice(0, 100);
    const existing = folders.find((f) => f.parent_id === null && f.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;

    const topLevel = folders.filter((f) => f.parent_id === null);
    const position = topLevel.length ? Math.max(...topLevel.map((f) => f.position)) + 1 : 0;
    const { data, error } = await supabase
      .from("video_categories")
      .insert({ name, parent_id: null, position })
      .select()
      .single();
    if (error) {
      notify(error.message, true);
      return null;
    }
    return data as VideoCategory;
  }

  async function updateVideo(id: string, changes: Partial<Video>) {
    setVideos((prev) => prev.map((v) => (v.id === id ? { ...v, ...changes } : v)));
    const { error } = await supabase.from("videos").update(changes).eq("id", id);
    if (error) {
      notify(error.message, true);
      load();
    }
  }

  // The green tick on a video row. Needs the column from video-watched.sql.
  async function toggleWatched(video: Video) {
    const watched_at = video.watched_at ? null : new Date().toISOString();
    setVideos((prev) => prev.map((v) => (v.id === video.id ? { ...v, watched_at } : v)));
    const { error } = await supabase.from("videos").update({ watched_at }).eq("id", video.id);
    if (!error) return;
    const missing = /watched_at/.test(error.message);
    notify(missing ? "One setup step first: run supabase/video-watched.sql in Supabase." : error.message, true);
    load();
  }

  function moveVideo(id: string, folderId: string | null) {
    const video = videos.find((v) => v.id === id);
    if (!video || video.category_id === folderId) return;
    updateVideo(id, { category_id: folderId, position: topPosition(folderId) });
    notify(`Moved to ${folderId ? folderPath(folderId) : "Uncategorized"}`);
  }

  // Drop one video onto another: it takes the target's place in the list.
  function reorderVideo(draggedId: string, targetId: string) {
    if (draggedId === targetId) return;
    if (itemSort !== "custom") {
      // Sorted by date or name: keep the order you see, put the dragged one before the target,
      // save that as your own order and switch Sort to "My order".
      const dragged = visibleVideos.find((v) => v.id === draggedId);
      const rest = visibleVideos.filter((v) => v.id !== draggedId);
      const at = rest.findIndex((v) => v.id === targetId);
      if (!dragged || at === -1) return;
      rest.splice(at, 0, dragged);
      rest.forEach((v, position) => {
        if (v.position !== position) updateVideo(v.id, { position });
      });
      setItemSort("custom");
      return;
    }
    const list = visibleVideos.filter((v) => v.id !== draggedId);
    const index = list.findIndex((v) => v.id === targetId);
    if (index === -1) return;
    const target = list[index];
    const before = list[index - 1];
    const position = before ? (before.position + target.position) / 2 : target.position - 1;
    updateVideo(draggedId, { position, category_id: target.category_id });
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

  function renameVideo(video: Video) {
    const title = window.prompt("Title:", video.title ?? "")?.trim();
    if (!title || title === video.title) return;
    updateVideo(video.id, { title: title.slice(0, 300) });
  }

  function editTags(video: Video) {
    const answer = window.prompt("Tags, separated by commas:", video.tags.join(", "));
    if (answer === null) return;
    const tags = Array.from(new Set(answer.split(",").map((t) => t.trim()).filter(Boolean)));
    updateVideo(video.id, { tags });
  }

  async function deleteVideo(video: Video) {
    const ok = await askConfirm({
      title: "Delete this whole video?",
      quote: video.title ?? undefined,
      message:
        "The video, its summary and all its notes will be gone for good.\n\nOnly want to remove the summary? Choose Keep the video, then use Clear summary.",
      confirmLabel: "Yes, delete video",
      cancelLabel: "Keep the video",
      danger: true,
    });
    if (!ok) return;
    setVideos((prev) => prev.filter((v) => v.id !== video.id));
    const { error } = await supabase.from("videos").delete().eq("id", video.id);
    if (error) {
      notify(error.message, true);
      load();
    }
  }

  // ---------- Category actions ----------

  async function createFolder(parentId: string | null) {
    const name = window.prompt(parentId ? `New subcategory inside "${folderPath(parentId)}":` : "New category name:");
    if (!name?.trim()) return;
    const siblings = folders.filter((f) => f.parent_id === parentId);
    const position = siblings.length ? Math.max(...siblings.map((f) => f.position)) + 1 : 0;
    const { data, error } = await supabase
      .from("video_categories")
      .insert({ name: name.trim(), parent_id: parentId, position })
      .select()
      .single();
    if (error) return notify(error.message, true);
    setFolders((prev) => [...prev, data as VideoCategory]);
    if (parentId) setExpanded((prev) => new Set(prev).add(parentId));
    setView({ kind: "folder", id: (data as VideoCategory).id });
  }

  // Drop a category onto another and it goes next to it, at that one's level. At the same level that just
  // changes the order; onto one at another level (its parent, say) it moves up or down to that level, just below it.
  async function moveFolderTo(draggedId: string, targetId: string) {
    const dragged = folders.find((c) => c.id === draggedId);
    const target = folders.find((c) => c.id === targetId);
    // It can't go next to itself, or into one of its own subcategories.
    if (!dragged || !target || isWithin(folders, target.id, dragged.id)) return;
    const parent_id = target.parent_id;
    const sameLevel = dragged.parent_id === parent_id;
    const all = childFolders(parent_id);
    const siblings = all.filter((c) => c.id !== dragged.id);
    const index = siblings.findIndex((c) => c.id === target.id);
    // Same level: dragging down puts it after the target, dragging up before it.
    siblings.splice(sameLevel && all.indexOf(dragged) > index ? index : index + 1, 0, dragged);
    const changed = siblings
      .map((c, position) => ({ id: c.id, position }))
      .filter((c, i) => siblings[i].position !== c.position || (!sameLevel && c.id === dragged.id));
    setFolders((prev) =>
      prev.map((c) => {
        const m = changed.find((x) => x.id === c.id);
        if (!m) return c;
        return c.id === dragged.id ? { ...c, position: m.position, parent_id } : { ...c, position: m.position };
      }),
    );
    const results = await Promise.all(
      changed.map((c) =>
        supabase
          .from("video_categories")
          .update(c.id === dragged.id && !sameLevel ? { position: c.position, parent_id } : { position: c.position })
          .eq("id", c.id),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed) {
      notify(failed.error!.message, true);
      load();
      return;
    }
    if (!sameLevel) {
      const into = folders.find((c) => c.id === parent_id);
      notify(into ? `Moved "${dragged.name}" into "${into.name}"` : `Moved "${dragged.name}" to the top level`);
    }
  }

  // Lifts a subfolder out to the top level, at the end of the list. Its own subfolders come with it.
  // Moves a subfolder out of its folder, into the folder one level above (or the top level).
  async function moveFolderUp(folder: VideoCategory) {
    const parent = folders.find((f) => f.id === folder.parent_id);
    const parent_id = parent?.parent_id ?? null;
    const position = Math.max(-1, ...childFolders(parent_id).map((f) => f.position)) + 1;
    setFolders((prev) => prev.map((f) => (f.id === folder.id ? { ...f, parent_id, position } : f)));
    const { error } = await supabase.from("video_categories").update({ parent_id, position }).eq("id", folder.id);
    if (error) {
      notify(error.message, true);
      load();
      return;
    }
    const into = folders.find((f) => f.id === parent_id);
    notify(into ? `Moved "${folder.name}" up into "${into.name}"` : `Moved "${folder.name}" up to the top level`);
  }

  function openFolderMenu(folder: VideoCategory, e: React.MouseEvent) {
    e.preventDefault();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: "Rename", icon: Pencil, tone: "yellow", onClick: () => renameFolder(folder) },
        { label: "New subcategory", icon: FolderPlus, tone: "amber", onClick: () => createFolder(folder.id) },
        ...(folder.parent_id
          ? [{ label: "Move up a level", icon: ArrowUp, tone: "violet" as const, onClick: () => moveFolderUp(folder) }]
          : []),
        ...(folder.share_token
          ? [
              { label: "Preview what others see", icon: Eye, tone: "violet" as const, onClick: () => previewShare(folder.share_token!) },
              { label: "Copy share link", icon: Copy, tone: "sky" as const, onClick: () => copyShareLink(folder.share_token!) },
              { label: "Stop sharing", icon: Link2Off, tone: "slate" as const, onClick: () => toggleShare(folder) },
            ]
          : [{ label: "Share", icon: Link2, tone: "sky" as const, onClick: () => toggleShare(folder) }]),
        { label: "Delete", icon: Trash2, tone: "red", onClick: () => deleteFolder(folder), danger: true },
      ],
    });
  }

  async function renameFolder(folder: VideoCategory) {
    const name = window.prompt("Rename category:", folder.name);
    if (!name?.trim() || name.trim() === folder.name) return;
    setFolders((prev) => prev.map((f) => (f.id === folder.id ? { ...f, name: name.trim() } : f)));
    const { error } = await supabase.from("video_categories").update({ name: name.trim() }).eq("id", folder.id);
    if (error) {
      notify(error.message, true);
      load();
    }
  }

  async function deleteFolder(folder: VideoCategory) {
    const ok = window.confirm(
      `Delete "${folder.name}" and any categories inside it?\nThe videos inside will move to Uncategorized, not be deleted.`,
    );
    if (!ok) return;
    const { error } = await supabase.from("video_categories").delete().eq("id", folder.id);
    if (error) return notify(error.message, true);
    setView({ kind: "all" });
    load();
  }

  async function toggleShare(folder: VideoCategory) {
    if (folder.share_token) {
      if (!window.confirm("Turn off the share link? People with the old link won't be able to see it anymore.")) return;
      const { error } = await supabase.from("video_categories").update({ share_token: null }).eq("id", folder.id);
      if (error) return notify(error.message, true);
      setFolders((prev) => prev.map((f) => (f.id === folder.id ? { ...f, share_token: null } : f)));
      notify("Sharing turned off");
      return;
    }
    const token = crypto.randomUUID();
    const { error } = await supabase.from("video_categories").update({ share_token: token }).eq("id", folder.id);
    if (error) return notify(error.message, true);
    setFolders((prev) => prev.map((f) => (f.id === folder.id ? { ...f, share_token: token } : f)));
    copyShareLink(token);
  }

  // Opens the shared page in a new tab, marked as a preview, so you see exactly what people with the link see.
  function previewShare(token: string) {
    window.open(`/share/${token}?preview=1`, "_blank", "noopener");
  }

  async function copyShareLink(token: string) {
    const link = `${window.location.origin}/share/${token}`;
    try {
      await navigator.clipboard.writeText(link);
      notify("Share link copied. Anyone with it can view this category.");
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
        ? "Uncategorized"
        : folderPath(view.id);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <button
          className="rounded-md border border-slate-300 px-2 py-1 text-sm md:hidden"
          onClick={() => setShowFolders((s) => !s)}
        >
          {showFolders ? "Close" : "Categories"}
        </button>
        <BrandMark />
        <span data-tour="sections" className="shrink-0">
          <SectionSwitch active="videos" />
        </span>
        <input
          data-tour="search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search titles, channels, notes…"
          className="ml-auto w-full max-w-xs rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <Link
          href="/clips"
          className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
          title="See and delete your clips to free up space"
        >
          <ClipsIcon size={20} />
          Clips
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
          // Right-click the FOLDERS / CATEGORIES heading, or anywhere in the sidebar that isn't a folder to make a new top-level one.
          onContextMenu={(e) => {
            if (e.defaultPrevented) return;
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY, items: [{ label: "New category", icon: FolderPlus, tone: "amber" as const, onClick: () => createFolder(null) }] });
          }}
        >
          <NavItem icon={Clapperboard} tone="violet" label="All videos" count={videos.length} active={view.kind === "all" && !searching} onClick={() => openView({ kind: "all" })} />
          <NavItem
            icon={Inbox}
            tone="blue"
            label="Uncategorized"
            count={videos.filter((v) => !v.category_id).length}
            active={view.kind === "unsorted" && !searching}
            onClick={() => openView({ kind: "unsorted" })}
            dropTarget={draggingId !== null}
            onDrop={() => draggingId && moveVideo(draggingId, null)}
          />

          <SidebarHeading label="Categories">
            <FolderSortSelect sort={folderSort} onChange={setFolderSort} />
            <button onClick={() => createFolder(null)} className="rounded px-1.5 text-base text-slate-700 hover:bg-slate-100" title="New category">
              +
            </button>
          </SidebarHeading>
          {childFolders(null).length === 0 && (
            <p className="px-2 text-sm text-slate-500">No categories yet. Click + to make one, like &quot;LLMs&quot; or &quot;Agents&quot;.</p>
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
            onDropFolder={(targetId) => {
              if (!draggingFolderId) return;
              moveFolderTo(draggingFolderId, targetId);
              // Dragging sets your own order, so the list switches to "My order" and keeps it.
              if (folderSort !== "custom") setFolderSort("custom");
            }}
            canDragFolders
            onFolderMenu={openFolderMenu}
          />
          {childFolders(null).length > 1 && (
            <p className="mt-3 px-2 text-xs text-slate-400">{sortHint(folderSort, "categories")}</p>
          )}

          <button onClick={signOut} className="mt-6 px-2 text-sm text-slate-500 underline sm:hidden">
            Sign out
          </button>
        </aside>

        <main className="min-w-0 flex-1 p-4 md:p-6">
          <ReportWriterLink />
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h1 className="mr-auto text-2xl font-bold">{title}</h1>
            <TourButton onClick={tour.start} />
            {currentFolder && !searching && (
              <>
                <SmallButton onClick={() => createFolder(currentFolder.id)}>+ Subcategory</SmallButton>
                <SmallButton onClick={() => renameFolder(currentFolder)}>Rename</SmallButton>
                <SmallButton
                  onClick={() => toggleShare(currentFolder)}
                  icon={currentFolder.share_token ? Link2Off : Link2}
                  tone={currentFolder.share_token ? "slate" : "sky"}
                >
                  {currentFolder.share_token ? "Stop sharing" : "Share"}
                </SmallButton>
                {currentFolder.share_token && (
                  <>
                    <SmallButton
                      onClick={() => previewShare(currentFolder.share_token!)}
                      icon={Eye}
                      tone="violet"
                      title="See this category the way people with the link see it"
                    >
                      Preview
                    </SmallButton>
                    <SmallButton onClick={() => copyShareLink(currentFolder.share_token!)} icon={Copy} tone="sky">
                      Copy link
                    </SmallButton>
                  </>
                )}
                <SmallButton onClick={() => deleteFolder(currentFolder)} danger>
                  Delete
                </SmallButton>
              </>
            )}
            <ItemSortSelect sort={itemSort} onChange={setItemSort} />
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
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm hover:bg-slate-50"
                >
                  <Ico icon={FolderIcon} tone="amber" />
                  {f.name}
                </button>
              ))}
            </div>
          )}

          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
            <Pills
              value={period}
              onChange={setPeriod}
              options={PERIODS.map((p) => ({ value: p.value, label: p.label }))}
              label="Added"
            />
            <Pills
              value={watchFilter}
              onChange={setWatchFilter}
              options={[
                { value: "all", label: "All" },
                { value: "unwatched", label: "Unwatched" },
                { value: "watched", label: "✓ Watched" },
              ]}
              label="Show"
            />
          </div>

          {loading ? (
            <p className="text-slate-500">Loading your library…</p>
          ) : videos.length === 0 && !searching ? (
            <WelcomePanel onAddSample={() => addVideo(SAMPLE_VIDEO.link)} />
          ) : visibleVideos.length === 0 ? (
            <EmptyState searching={searching || watchFilter !== "all" || period !== "any"} hasVideos={videos.length > 0} />
          ) : (
            <>
              {canReorder && visibleVideos.length > 1 && (
                <p className="mb-3 text-xs text-slate-500">
                  Tip: use ▲ ▼ on a video, or drag it onto another, to change the order. Drop it on a folder to move it.
                </p>
              )}
              {!canReorder && visibleVideos.length > 1 && (
                <p className="mb-3 text-xs text-slate-500">
                  {`${searching ? "Search results" : "All videos"} show the newest first. To change the order, open a category on the left.`}
                </p>
              )}
              <div className="flex flex-col gap-2">
                {visibleVideos.map((video, index) => (
                  <VideoCard
                    key={video.id}
                    video={video}
                    folderOptions={folderOptions}
                    hasNotes={notedVideoIds.has(video.id)}
                    flash={flashId === video.id}
                    canReorder={canReorder}
                    dragging={draggingId === video.id}
                    onDragStart={() => setDraggingId(video.id)}
                    onDragEnd={() => setDraggingId(null)}
                    onDropOnto={() => draggingId && reorderVideo(draggingId, video.id)}
                    onShift={canShift ? (step) => shiftVideo(video.id, step) : null}
                    isFirst={index === 0}
                    isLast={index === visibleVideos.length - 1}
                    onMove={(folderId) => moveVideo(video.id, folderId)}
                    onEditTags={() => editTags(video)}
                    onRename={() => renameVideo(video)}
                    onSaveNote={(note) => updateVideo(video.id, { note })}
                    onToggleWatched={() => toggleWatched(video)}
                    aiNoteStartedAt={aiJobs.running.find((j) => j.key === aiNoteKey(video.id))?.startedAt ?? null}
                    aiNoteError={aiJobs.errors.get(aiNoteKey(video.id)) ?? null}
                    onAiNote={() => writeAiNote(video)}
                    onDelete={() => deleteVideo(video)}
                    onTagClick={(tag) => setQuery(tag)}
                    where={
                      searching || view.kind !== "folder"
                        ? video.category_id ? folderPath(video.category_id) || "Uncategorized" : "Uncategorized"
                        : null
                    }
                    onShowWhere={() => {
                      setQuery("");
                      pointAt(video);
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </main>
      </div>

      {menu && <ContextMenu menu={menu} onClose={closeMenu} />}

      {toast && <ToastBox toast={toast} onClose={() => setToast(null)} />}
      <Tour open={tour.open} steps={tour.steps} onClose={tour.close} />
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
  icon?: LucideIcon;
  tone?: Tone;
}) {
  const { ref, over, handlers } = usePointerDrag<HTMLDivElement>({
    onDragStart: props.onDragStart,
    onDragEnd: props.onDragEnd,
    canDrop: props.dropTarget,
    onDrop: props.onDrop,
  });
  return (
    <div
      ref={ref}
      {...handlers}
      onContextMenu={props.onContextMenu}
      className={`flex items-center rounded-md text-sm ${props.active ? "bg-slate-900 text-white" : "hover:bg-slate-100"} ${over ? "ring-2 ring-blue-500" : ""}`}
      style={{ paddingLeft: (props.indent ?? 0) * 14 }}
    >
      {props.leading}
      <button onClick={props.onClick} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left">
        {props.icon && <Ico icon={props.icon} tone={props.tone ?? "slate"} />}
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
  childFolders: (parentId: string | null) => VideoCategory[];
  videos: Video[];
  expanded: Set<string>;
  setExpanded: React.Dispatch<React.SetStateAction<Set<string>>>;
  activeId: string | null;
  onOpen: (id: string) => void;
  draggingId: string | null;
  onDropVideo: (folderId: string) => void;
  draggingFolder: VideoCategory | null;
  onFolderDragStart: (id: string) => void;
  onFolderDragEnd: () => void;
  onDropFolder: (targetId: string) => void;
  canDragFolders: boolean;
  onFolderMenu: (folder: VideoCategory, e: React.MouseEvent) => void;
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
              icon={folder.share_token ? Link2 : FolderIcon}
              tone={folder.share_token ? "sky" : "amber"}
              label={folder.name}
              // A top-level folder counts the videos in all its subfolders too; a subfolder counts only its own.
              count={props.videos.filter((v) => (props.depth === 0 ? inTree(v.category_id, folder.id) : v.category_id === folder.id)).length}
              active={props.activeId === folder.id}
              onClick={() => props.onOpen(folder.id)}
              indent={props.depth}
              // A dragged video drops into the category; a dragged category goes next to this one, at its level.
              dropTarget={
                props.draggingId !== null ||
                (draggingFolder !== null && !inTree(folder.id, draggingFolder.id))
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
    <form data-tour="add-video" onSubmit={submit} className="mb-5 flex flex-col gap-2 sm:flex-row">
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
  onRename: () => void;
  onSaveNote: (note: string) => void;
  onToggleWatched: () => void;
  aiNoteStartedAt: number | null;
  aiNoteError: string | null;
  onAiNote: () => void;
  onDelete: () => void;
  onTagClick: (tag: string) => void;
  /** The video's category path, shown when the list mixes categories (All videos, search). */
  where: string | null;
  onShowWhere: () => void;
  flash: boolean;
}) {
  const { video } = props;
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (props.flash) cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [props.flash]);
  const [editingNote, setEditingNote] = useState(false);
  const { over, handlers } = usePointerDrag(
    {
      onDragStart: editingNote ? undefined : props.onDragStart,
      onDragEnd: props.onDragEnd,
      canDrop: props.canReorder && !props.dragging,
      onDrop: props.onDropOnto,
    },
    cardRef,
  );

  return (
    <div
      ref={cardRef}
      {...handlers}
      className={`flex gap-3 rounded-xl border bg-white p-3 shadow-sm transition ${props.dragging ? "opacity-40" : ""} ${over ? "border-blue-500 ring-2 ring-blue-500" : props.flash ? "border-green-500 ring-4 ring-green-400" : "border-slate-200"}`}
    >
      <ReadCheck read={Boolean(video.watched_at)} onClick={props.onToggleWatched} word="watched" />
      <div className="w-28 shrink-0 cursor-grab overflow-hidden rounded-lg sm:w-48">
        <div className="relative">
          <VideoThumb video={video} href={`/video/${video.id}`} />
          {/* Videos with notes get a badge, so they stand out in the list. */}
          {props.hasNotes && (
            <span className="pointer-events-none absolute top-1 left-1 rounded-md bg-amber-400 px-1.5 py-0.5 text-[11px] font-bold text-amber-950 shadow">
              <Ico icon={NotebookText} tone="amber" size={12} className="mr-0.5 inline align-[-2px]" />
              Notes
            </span>
          )}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <a
          href={`/video/${video.id}`}
          className={`line-clamp-2 font-medium hover:underline ${video.watched_at ? "text-slate-500" : ""}`}
          draggable={false}
        >
          {video.title}
        </a>
        {props.where && (
          <CategoryTag path={props.where} onClick={props.onShowWhere} />
        )}
        <p className="text-xs text-slate-500">
          {video.channel && `${video.channel} · `}Added {formatDate(video.created_at)}
          {video.watched_at && <span className="text-green-700"> · Watched {formatDate(video.watched_at)}</span>}
        </p>
        <ArticleNote note={video.note} editing={editingNote} setEditing={setEditingNote} onSave={props.onSaveNote} />
        {props.aiNoteError && !video.note && (
          <p className="flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700 ring-1 ring-red-200">
            <Ico icon={TriangleAlert} tone="red" size={14} />
            {props.aiNoteError}
          </p>
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
            className={
              props.hasNotes
                ? "inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-200"
                : "inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
            }
            draggable={false}
          >
            <Ico icon={props.hasNotes ? NotebookText : Pencil} tone={props.hasNotes ? "amber" : "yellow"} size={14} />
            {props.hasNotes ? "Open notes" : "Take notes"}
          </a>
          <a
            href={video.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
            draggable={false}
          >
            <Ico icon={ExternalLink} tone="red" size={14} />
            YouTube
          </a>
          <select
            value={video.category_id ?? ""}
            onChange={(e) => props.onMove(e.target.value || null)}
            className="max-w-48 min-w-0 rounded-md border border-slate-300 bg-white px-1 py-1 text-xs"
            aria-label="Move to category"
          >
            <option value="">Uncategorized</option>
            {props.folderOptions.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
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
          {!video.note && !editingNote && <SmallButton onClick={() => setEditingNote(true)} icon={FilePen} tone="sky">Add summary</SmallButton>}
          {video.note && !editingNote && (
            <SmallButton
              onClick={async () => {
                const ok = await askConfirm({
                  title: "Clear this summary?",
                  quote: video.note,
                  message: "Only the summary goes away. The video and your notes stay as they are.",
                  confirmLabel: "Yes, clear summary",
                  cancelLabel: "Keep it",
                });
                if (ok) props.onSaveNote("");
              }}
              icon={Brush}
              tone="orange"
            >
              Clear summary
            </SmallButton>
          )}
          {!video.note && !editingNote && props.aiNoteStartedAt === null && (
            <SmallButton onClick={props.onAiNote} title="Let AI watch the video and write the summary" icon={Sparkles} tone="yellow">
              AI summary
            </SmallButton>
          )}
          {!video.note && props.aiNoteStartedAt !== null && <AiNoteWorking startedAt={props.aiNoteStartedAt} />}
          <SmallButton onClick={props.onRename}>Edit title</SmallButton>
          <SmallButton onClick={props.onEditTags}>Tags</SmallButton>
          {/* Kept apart from the note buttons so it isn't pressed by mistake. */}
          <span className="ml-auto pl-3">
            <SmallButton onClick={props.onDelete} danger icon={Trash2}>
              Delete video
            </SmallButton>
          </span>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ searching, hasVideos }: { searching: boolean; hasVideos: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-500">
      {searching
        ? "No videos match. Try another search, or pick Any time and All above."
        : hasVideos
          ? "No videos here yet. Paste a link above, or move videos in from another category."
          : "Your library is empty. Paste a YouTube link above to save your first video."}
    </div>
  );
}
