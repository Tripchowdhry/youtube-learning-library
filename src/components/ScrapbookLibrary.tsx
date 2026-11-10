"use client";

import { Tour, TourButton, useSectionTour } from "@/components/Tour";
import BrandMark from "@/components/BrandMark";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePointerDrag } from "@/lib/pointer-drag";
import { isWithin, treeOptions, treePath } from "@/lib/category-tree";
import CategoryTree from "@/components/CategoryTree";
import { useRouter } from "next/navigation";
import ContextMenu, { type MenuState } from "@/components/ContextMenu";
import {
  FolderSortSelect,
  ItemSortSelect,
  compareFolders,
  compareItems,
  sortHint,
  useFolderSort,
  useItemSort,
} from "@/components/FolderSort";
import {
  NavItem,
  PERIODS,
  Pills,
  SectionSwitch,
  SetupNotice,
  SmallButton,
  formatDate,
  type Period,
} from "@/components/ReadingLibrary";
import { SectionWelcome } from "@/components/GettingStarted";
import { createClient } from "@/lib/supabase/client";
import type { ArticleCategory, Scrap } from "@/lib/types";
import { ArrowUp, Copy, Eye, FileText, Link2, Link2Off, Inbox, NotebookPen, Pencil, Tag, Trash2 } from "lucide-react";
import { Ico } from "@/components/Icon";

type View = { kind: "all" } | { kind: "uncategorized" } | { kind: "category"; id: string };

// The list doesn't need the handwriting, which can be large.
type ScrapSummary = Omit<Scrap, "pages">;
const LIST_COLUMNS = "id,user_id,category_id,title,body,position,created_at,updated_at";

// The typed text of a page without its formatting, for search and the preview line.
export function plainText(html: string) {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6])[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export default function ScrapbookLibrary({ userEmail }: { userEmail: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [categories, setCategories] = useState<ArticleCategory[]>([]);
  const [scraps, setScraps] = useState<ScrapSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [view, setView] = useState<View>({ kind: "all" });
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState<Period>("any");
  const [showCategories, setShowCategories] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingCategoryId, setDraggingCategoryId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const [toast, setToast] = useState<{ text: string; isError?: boolean } | null>(null);
  const tour = useSectionTour("scrapbook", !loading);

  const notify = useCallback((text: string, isError = false) => {
    setToast({ text, isError });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    const [c, s] = await Promise.all([
      supabase.from("article_categories").select("*").eq("kind", "scrap").order("position").order("name"),
      supabase.from("scraps").select(LIST_COLUMNS).order("created_at", { ascending: false }),
    ]);
    const error = c.error ?? s.error;
    if (error) {
      // Before supabase/scrapbook.sql has been run, the table doesn't exist yet.
      if (/does not exist|schema cache/i.test(error.message)) setNeedsSetup(true);
      else notify(error.message, true);
    } else {
      setCategories(c.data as ArticleCategory[]);
      setScraps(s.data as ScrapSummary[]);
    }
    setLoading(false);
  }, [supabase, notify]);

  useEffect(() => {
    load();
  }, [load]);

  // ---------- Category helpers ----------

  const [folderSort, setFolderSort] = useFolderSort();
  const [itemSort, setItemSort] = useItemSort();
  // Categories sit inside each other, any number of levels deep, like the Videos folders.
  const childCategories = useCallback(
    (parentId: string | null) => categories.filter((c) => c.parent_id === parentId).sort(compareFolders(folderSort)),
    [categories, folderSort],
  );
  const topCategories = useMemo(() => childCategories(null), [childCategories]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCategory = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const categoryPath = useCallback((id: string | null) => treePath(categories, id), [categories]);

  // Every category in tree order, for the "Category" menus.
  const categoryOptions = useMemo(() => treeOptions(childCategories), [childCategories]);

  const canDragCategories = true;
  const categorySiblings = (category: ArticleCategory) =>
    childCategories(category.parent_id);

  const currentCategory = view.kind === "category" ? categories.find((c) => c.id === view.id) ?? null : null;

  // A category shows its own pages plus those in every category inside it.
  const inCategory = useCallback(
    (scrap: ScrapSummary, id: string) => isWithin(categories, scrap.category_id, id),
    [categories],
  );

  // ---------- Which pages to show ----------

  const searching = query.trim().length > 0;
  // Dragging to reorder works inside a folder whatever the sort; ▲ ▼ only in your own order.
  const canReorder = !searching && view.kind !== "all";
  const canShift = canReorder && itemSort === "custom";

  const visibleScraps = useMemo(() => {
    const q = query.trim().toLowerCase();
    const days = PERIODS.find((p) => p.value === period)!.days;
    const since = days ? Date.now() - days * 86_400_000 : 0;
    const shown = scraps.filter((s) => {
      if (since && new Date(s.created_at).getTime() < since) return false;
      if (q) return [s.title, plainText(s.body), categoryPath(s.category_id)].some((t) => t.toLowerCase().includes(q));
      if (view.kind === "uncategorized") return !s.category_id;
      if (view.kind === "category") return inCategory(s, view.id);
      return true;
    });
    return shown.sort(compareItems<ScrapSummary>(itemSort, (s) => s.title, !searching && view.kind !== "all"));
  }, [scraps, query, period, view, categoryPath, inCategory, searching, itemSort]);

  const countIn = (id: string) => scraps.filter((s) => inCategory(s, id)).length;

  // ---------- Page actions ----------

  const topPosition = (categoryId: string | null, exceptId?: string) => {
    const siblings = scraps.filter((s) => s.category_id === categoryId && s.id !== exceptId);
    return siblings.length ? Math.min(...siblings.map((s) => s.position)) - 1 : 0;
  };

  async function createScrap(title: string, categoryId: string | null) {
    const { data, error } = await supabase
      .from("scraps")
      .insert({ title: title.slice(0, 200) || "Untitled", category_id: categoryId, position: topPosition(categoryId) })
      .select("id")
      .single();
    if (error) {
      notify(error.message, true);
      return false;
    }
    router.push(`/scrap/${data.id}`);
    return true;
  }

  async function updateScrap(id: string, changes: Partial<ScrapSummary>) {
    setScraps((prev) => prev.map((s) => (s.id === id ? { ...s, ...changes } : s)));
    const { error } = await supabase.from("scraps").update(changes).eq("id", id);
    if (error) {
      notify(error.message, true);
      load();
    }
  }

  function moveScrap(id: string, categoryId: string | null) {
    const scrap = scraps.find((s) => s.id === id);
    if (!scrap || scrap.category_id === categoryId) return;
    updateScrap(id, { category_id: categoryId, position: topPosition(categoryId) });
    notify(`Moved to ${categoryPath(categoryId) || "Uncategorized"}`);
  }

  // Drop one page onto another: it takes the target's place in the list.
  function reorderScrap(draggedId: string, targetId: string) {
    if (draggedId === targetId) return;
    if (itemSort !== "custom") {
      // Sorted by date or name: keep the order you see, put the dragged one before the target,
      // save that as your own order and switch Sort to "My order".
      const dragged = visibleScraps.find((s) => s.id === draggedId);
      const rest = visibleScraps.filter((s) => s.id !== draggedId);
      const at = rest.findIndex((s) => s.id === targetId);
      if (!dragged || at === -1) return;
      rest.splice(at, 0, dragged);
      rest.forEach((s, position) => {
        if (s.position !== position) updateScrap(s.id, { position });
      });
      setItemSort("custom");
      return;
    }
    const list = visibleScraps.filter((s) => s.id !== draggedId);
    const index = list.findIndex((s) => s.id === targetId);
    if (index === -1) return;
    const target = list[index];
    const before = list[index - 1];
    updateScrap(draggedId, { position: before ? (before.position + target.position) / 2 : target.position - 1 });
  }

  // Swap a page with its neighbor: -1 moves it up, +1 down.
  function shiftScrap(id: string, step: -1 | 1) {
    const index = visibleScraps.findIndex((s) => s.id === id);
    const neighbor = visibleScraps[index + step];
    if (index === -1 || !neighbor) return;
    const scrap = visibleScraps[index];
    if (scrap.position === neighbor.position) {
      updateScrap(scrap.id, { position: neighbor.position + step * 0.5 });
      return;
    }
    updateScrap(scrap.id, { position: neighbor.position });
    updateScrap(neighbor.id, { position: scrap.position });
  }

  function renameScrap(scrap: ScrapSummary) {
    const title = window.prompt("Title:", scrap.title)?.trim().slice(0, 200);
    if (!title || title === scrap.title) return;
    updateScrap(scrap.id, { title });
  }

  async function deleteScrap(scrap: ScrapSummary) {
    if (!window.confirm(`Delete "${scrap.title}" from your ScrapBook?\nThis can't be undone.`)) return;
    setScraps((prev) => prev.filter((s) => s.id !== scrap.id));
    const { error } = await supabase.from("scraps").delete().eq("id", scrap.id);
    if (error) {
      notify(error.message, true);
      load();
    }
  }

  // ---------- Category actions ----------

  async function createCategory(parentId: string | null) {
    const name = window
      .prompt(parentId ? `New subcategory inside "${categoryPath(parentId)}":` : "New category name:")
      ?.trim();
    if (!name) return;
    const siblings = categories.filter((c) => c.parent_id === parentId);
    const position = siblings.length ? Math.max(...siblings.map((c) => c.position)) + 1 : 0;
    const { data, error } = await supabase
      .from("article_categories")
      .insert({ name: name.slice(0, 100), parent_id: parentId, position, kind: "scrap" })
      .select()
      .single();
    if (error) return notify(error.message, true);
    setCategories((prev) => [...prev, data as ArticleCategory]);
    openView({ kind: "category", id: (data as ArticleCategory).id });
  }

  // Drop one category onto another next to it: it takes that one's place, and the rest are renumbered so the order sticks.
  async function moveCategoryTo(draggedId: string, targetId: string) {
    const dragged = categories.find((c) => c.id === draggedId);
    const target = categories.find((c) => c.id === targetId);
    if (!dragged || !target || dragged.id === target.id || dragged.parent_id !== target.parent_id) return;
    const all = categorySiblings(dragged);
    const siblings = all.filter((c) => c.id !== dragged.id);
    const index = siblings.findIndex((c) => c.id === target.id);
    siblings.splice(all.indexOf(dragged) <= index ? index + 1 : index, 0, dragged);
    const changed = siblings.map((c, position) => ({ id: c.id, position })).filter((c, i) => siblings[i].position !== c.position);
    setCategories((prev) => prev.map((c) => ({ ...c, position: changed.find((x) => x.id === c.id)?.position ?? c.position })));
    const results = await Promise.all(
      changed.map((c) => supabase.from("article_categories").update({ position: c.position }).eq("id", c.id)),
    );
    const failed = results.find((r) => r.error);
    if (failed) {
      notify(failed.error!.message, true);
      load();
    }
  }

  // Moves a category out of the one it sits in, into the category one level above (or the top level).
  async function moveCategoryUp(category: { id: string; name: string; parent_id: string | null }) {
    const parent = categories.find((c) => c.id === category.parent_id);
    const parent_id = parent?.parent_id ?? null;
    const position = Math.max(-1, ...childCategories(parent_id).map((c) => c.position)) + 1;
    setCategories((prev) => prev.map((c) => (c.id === category.id ? { ...c, parent_id, position } : c)));
    const { error } = await supabase.from("article_categories").update({ parent_id, position }).eq("id", category.id);
    if (error) {
      notify(error.message, true);
      load();
      return;
    }
    const into = categories.find((c) => c.id === parent_id);
    notify(into ? `Moved "${category.name}" up into "${into.name}"` : `Moved "${category.name}" up to the top level`);
  }

  function openCategoryMenu(category: ArticleCategory, e: React.MouseEvent) {
    e.preventDefault();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: "Rename", icon: Pencil, tone: "yellow" as const, onClick: () => renameCategory(category) },
        { label: "New subcategory", icon: Tag, tone: "orange" as const, onClick: () => createCategory(category.id) },
        ...(category.parent_id
          ? [{ label: "Move up a level", icon: ArrowUp, tone: "violet" as const, onClick: () => moveCategoryUp(category) }]
          : []),
        ...(category.share_token
          ? [
              { label: "Preview what others see", icon: Eye, tone: "violet" as const, onClick: () => previewShare(category.share_token!) },
              { label: "Copy share link", icon: Copy, tone: "sky" as const, onClick: () => copyShareLink(category.share_token!) },
              { label: "Stop sharing", icon: Link2Off, tone: "slate" as const, onClick: () => toggleShare(category) },
            ]
          : [{ label: "Share", icon: Link2, tone: "sky" as const, onClick: () => toggleShare(category) }]),
        { label: "Delete", icon: Trash2, tone: "red" as const, onClick: () => deleteCategory(category), danger: true },
      ],
    });
  }

  // What happens when something is dropped on a category: a page moves into it,
  // a category next to it takes its place.
  const dropOnCategory = (category: ArticleCategory) => {
    if (draggingId) return () => moveScrap(draggingId, category.id);
    const dragged = categories.find((c) => c.id === draggingCategoryId);
    if (dragged && dragged.id !== category.id && dragged.parent_id === category.parent_id) {
      return () => {
        moveCategoryTo(dragged.id, category.id);
        // Dragging sets your own order, so the list switches to "My order" and keeps it.
        if (folderSort !== "custom") setFolderSort("custom");
      };
    }
    return undefined;
  };

  async function renameCategory(category: ArticleCategory) {
    const name = window.prompt("Rename:", category.name)?.trim();
    if (!name || name === category.name) return;
    setCategories((prev) => prev.map((c) => (c.id === category.id ? { ...c, name } : c)));
    const { error } = await supabase.from("article_categories").update({ name }).eq("id", category.id);
    if (error) {
      notify(error.message, true);
      load();
    }
  }

  async function deleteCategory(category: ArticleCategory) {
    const ok = window.confirm(
      `Delete "${category.name}" and any categories inside it?\nThe pages inside will move to Uncategorized, not be deleted.`,
    );
    if (!ok) return;
    const { error } = await supabase.from("article_categories").delete().eq("id", category.id);
    if (error) return notify(error.message, true);
    setView({ kind: "all" });
    load();
  }

  // ---------- Sharing a category with a link ----------

  const shareError = (message: string) =>
    /share_token/.test(message) ? "To share categories, run supabase/share-categories.sql in Supabase first." : message;

  async function toggleShare(category: ArticleCategory) {
    if (category.share_token) {
      if (!window.confirm("Turn off the share link? People with the old link won't be able to see it anymore.")) return;
      const { error } = await supabase.from("article_categories").update({ share_token: null }).eq("id", category.id);
      if (error) return notify(shareError(error.message), true);
      setCategories((prev) => prev.map((c) => (c.id === category.id ? { ...c, share_token: null } : c)));
      notify("Sharing turned off");
      return;
    }
    const token = crypto.randomUUID();
    const { error } = await supabase.from("article_categories").update({ share_token: token }).eq("id", category.id);
    if (error) return notify(shareError(error.message), true);
    setCategories((prev) => prev.map((c) => (c.id === category.id ? { ...c, share_token: token } : c)));
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
    router.push("/");
    router.refresh();
  }

  function openView(next: View) {
    setView(next);
    setQuery("");
    setShowCategories(false);
  }

  // ---------- Render ----------

  const title = searching
    ? `Search results for "${query.trim()}"`
    : view.kind === "all"
      ? "All pages"
      : view.kind === "uncategorized"
        ? "Uncategorized"
        : categoryPath(view.id);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <button
          className="rounded-md border border-slate-300 px-2 py-1 text-sm md:hidden"
          onClick={() => setShowCategories((s) => !s)}
        >
          {showCategories ? "Close" : "Categories"}
        </button>
        <BrandMark />
        <SectionSwitch active="scrap" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search titles and text…"
          className="ml-auto w-full max-w-xs rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <div className="hidden items-center gap-2 text-sm text-slate-500 sm:flex">
          <span className="max-w-40 truncate">{userEmail}</span>
          <button onClick={signOut} className="rounded-md px-2 py-1 hover:bg-slate-100">
            Sign out
          </button>
        </div>
      </header>
      <Tour open={tour.open} steps={tour.steps} onClose={tour.close} />

      <div className="flex flex-1">
        <aside
          className={`${showCategories ? "fixed inset-x-0 top-[57px] bottom-0 z-10 block" : "hidden"} w-full overflow-y-auto border-r border-slate-200 bg-white p-3 md:sticky md:top-[57px] md:block md:h-[calc(100vh-57px)] md:w-72`}
          // Right-click the FOLDERS / CATEGORIES heading, or anywhere in the sidebar that isn't a categorie to make a new top-level one.
          onContextMenu={(e) => {
            if (e.defaultPrevented) return;
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY, items: [{ label: "New category", icon: Tag, tone: "orange" as const, onClick: () => createCategory(null) }] });
          }}
        >
          <NavItem icon={NotebookPen} tone="amber" label="All pages" count={scraps.length} active={view.kind === "all" && !searching} onClick={() => openView({ kind: "all" })} />
          <NavItem
            icon={Inbox}
            tone="blue"
            label="Uncategorized"
            count={scraps.filter((s) => !s.category_id).length}
            active={view.kind === "uncategorized" && !searching}
            onClick={() => openView({ kind: "uncategorized" })}
            onDropArticle={draggingId ? () => moveScrap(draggingId, null) : undefined}
          />

          <div className="mt-4 mb-1 flex items-center justify-between px-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Categories
            <FolderSortSelect sort={folderSort} onChange={setFolderSort} />
            <button onClick={() => createCategory(null)} className="rounded px-1.5 text-base text-slate-700 hover:bg-slate-100" title="New category">
              +
            </button>
          </div>
          {topCategories.length === 0 && (
            <p className="px-2 text-sm text-slate-500">No categories yet. Click + to make one, like &quot;Ideas&quot;.</p>
          )}
          <CategoryTree
            parentId={null}
            childrenOf={childCategories}
            collapsed={collapsed}
            onToggle={toggleCategory}
            activeId={!searching && view.kind === "category" ? view.id : null}
            count={countIn}
            onOpen={(id) => openView({ kind: "category", id })}
            dropOn={dropOnCategory}
            onDragStart={canDragCategories ? setDraggingCategoryId : undefined}
            onDragEnd={() => setDraggingCategoryId(null)}
            onMenu={openCategoryMenu}
          />
          {topCategories.length > 1 && (
            <p className="mt-3 px-2 text-xs text-slate-400">{sortHint(folderSort, "categories")}</p>
          )}

          <button onClick={signOut} className="mt-6 px-2 text-sm text-slate-500 underline sm:hidden">
            Sign out
          </button>
        </aside>

        <main className="min-w-0 flex-1 p-4 md:p-6">
          {needsSetup ? (
            <SetupNotice file="scrapbook.sql" />
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <h1 className="mr-auto text-2xl font-bold">{title}</h1>
                <TourButton onClick={tour.start} />
                {currentCategory && !searching && (
                  <>
                    <SmallButton onClick={() => createCategory(currentCategory.id)}>+ Subcategory</SmallButton>
                    <SmallButton onClick={() => renameCategory(currentCategory)}>Rename</SmallButton>
                    <SmallButton
                      onClick={() => toggleShare(currentCategory)}
                      icon={currentCategory.share_token ? Link2Off : Link2}
                      tone={currentCategory.share_token ? "slate" : "sky"}
                    >
                      {currentCategory.share_token ? "Stop sharing" : "Share"}
                    </SmallButton>
                    {currentCategory.share_token && (
                      <>
                        <SmallButton
                          onClick={() => previewShare(currentCategory.share_token!)}
                          icon={Eye}
                          tone="violet"
                          title="See this category the way people with the link see it"
                        >
                          Preview
                        </SmallButton>
                        <SmallButton onClick={() => copyShareLink(currentCategory.share_token!)} icon={Copy} tone="sky">
                          Copy link
                        </SmallButton>
                      </>
                    )}
                    <SmallButton onClick={() => deleteCategory(currentCategory)} danger>
                      Delete
                    </SmallButton>
                  </>
                )}
                <ItemSortSelect sort={itemSort} onChange={setItemSort} />
              </div>


              {!searching && (
                <NewScrapForm
                  key={view.kind === "category" ? view.id : view.kind}
                  onCreate={createScrap}
                  defaultCategoryId={view.kind === "category" ? view.id : null}
                  categoryOptions={categoryOptions}
                />
              )}

              <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
                <Pills
                  value={period}
                  onChange={setPeriod}
                  options={PERIODS.map((p) => ({ value: p.value, label: p.label }))}
                  label="Created"
                />
              </div>

              {loading ? (
                <p className="text-slate-500">Loading your ScrapBook…</p>
              ) : scraps.length === 0 && !searching && period === "any" ? (
                <SectionWelcome
                  title="Start your ScrapBook"
                  text="Pages of your own for ideas, plans and sketches. Give your first page a title above and tap + New page."
                  features={[
                    { title: "Write or draw", text: "Type freely, or draw and handwrite on the page." },
                    { title: "Sort", text: "Group pages into categories, like \"Ideas\" or \"Projects\"." },
                    { title: "Find", text: "Search finds any page by its title or text." },
                  ]}
                  action={{ label: "Name your first page", target: "new-page" }}
                />
              ) : visibleScraps.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-500">
                  {searching || period !== "any"
                    ? "Nothing matches. Try another search or a longer time range."
                    : "Nothing here yet. Start a new page above, or move pages in from another category."}
                </div>
              ) : (
                <>
                  {visibleScraps.length > 1 && (
                    <p className="mb-3 text-xs text-slate-500">
                      {canReorder
                        ? "Tip: drag a page onto another, or use ▲ ▼, to change the order. Drop it on a category to move it."
                        : `${searching ? "Search results" : "All pages"} show the newest first. To change the order, open a category on the left.`}
                    </p>
                  )}
                  <ul className="flex flex-col gap-2">
                    {visibleScraps.map((scrap, index) => (
                      <ScrapRow
                        key={scrap.id}
                        scrap={scrap}
                        categoryLabel={categoryPath(scrap.category_id) || "Uncategorized"}
                        categoryOptions={categoryOptions}
                        onMove={(categoryId) => moveScrap(scrap.id, categoryId)}
                        canReorder={canReorder}
                        dragging={draggingId === scrap.id}
                        onDragStart={() => setDraggingId(scrap.id)}
                        onDragEnd={() => setDraggingId(null)}
                        onDropOnto={() => draggingId && reorderScrap(draggingId, scrap.id)}
                        onShift={canShift ? (step) => shiftScrap(scrap.id, step) : null}
                        isFirst={index === 0}
                        isLast={index === visibleScraps.length - 1}
                        onRename={() => renameScrap(scrap)}
                        onDelete={() => deleteScrap(scrap)}
                      />
                    ))}
                  </ul>
                </>
              )}
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

function ScrapRow(props: {
  scrap: ScrapSummary;
  categoryLabel: string;
  categoryOptions: { id: string; label: string }[];
  onMove: (categoryId: string | null) => void;
  canReorder: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropOnto: () => void;
  onShift: ((step: -1 | 1) => void) | null;
  isFirst: boolean;
  isLast: boolean;
  onRename: () => void;
  onDelete: () => void;
}) {
  const { scrap } = props;
  const { ref, over, handlers } = usePointerDrag<HTMLLIElement>({
    onDragStart: props.onDragStart,
    onDragEnd: props.onDragEnd,
    canDrop: props.canReorder && !props.dragging,
    onDrop: props.onDropOnto,
  });
  const preview = plainText(scrap.body);
  const edited = formatDate(scrap.updated_at);
  return (
    <li
      ref={ref}
      {...handlers}
      className={`flex cursor-grab items-start gap-3 rounded-xl border bg-white p-3 shadow-sm transition ${props.dragging ? "opacity-40" : ""} ${over ? "border-blue-500 ring-2 ring-blue-500" : "border-slate-200"}`}
    >
      <Ico icon={FileText} tone="sky" size={22} className="mt-0.5" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link href={`/scrap/${scrap.id}`} className="line-clamp-2 font-medium hover:underline">
          {scrap.title}
        </Link>
        <p className="text-xs text-slate-500">
          Created {formatDate(scrap.created_at)}
          {edited !== formatDate(scrap.created_at) && ` · Edited ${edited}`}
        </p>
        {preview && <p className="line-clamp-2 text-sm text-slate-600">{preview}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <select
            value={scrap.category_id ?? ""}
            onChange={(e) => props.onMove(e.target.value || null)}
            className="max-w-48 min-w-0 rounded-md border border-slate-300 bg-white px-1 py-1 text-xs"
            aria-label="Category"
            title={props.categoryLabel}
          >
            <option value="">Uncategorized</option>
            {props.categoryOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <Link
            href={`/scrap/${scrap.id}`}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
          >
            Open
          </Link>
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
          <SmallButton onClick={props.onRename}>Edit title</SmallButton>
          <SmallButton onClick={props.onDelete} danger title="Delete" icon={Trash2}>
            Delete
          </SmallButton>
        </div>
      </div>
    </li>
  );
}

function NewScrapForm(props: {
  onCreate: (title: string, categoryId: string | null) => Promise<boolean>;
  defaultCategoryId: string | null;
  categoryOptions: { id: string; label: string }[];
}) {
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState(props.defaultCategoryId ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await props.onCreate(title.trim(), categoryId || null);
    setBusy(false);
  }

  return (
    <form data-tour="new-page" onSubmit={submit} className="mb-4 flex flex-col gap-2 sm:flex-row">
      <input
        value={title}
        maxLength={200}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title of a new page, like “Ideas for the app”…"
        className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2"
      />
      <select
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm sm:max-w-48"
        aria-label="Category for the new page"
      >
        <option value="">Uncategorized</option>
        {props.categoryOptions.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <button
        disabled={busy}
        className="rounded-md bg-blue-600 px-4 py-2 font-semibold whitespace-nowrap text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {busy ? "Creating…" : "+ New page"}
      </button>
    </form>
  );
}
