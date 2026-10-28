"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ContextMenu, { type MenuState } from "@/components/ContextMenu";
import { FolderSortSelect, compareFolders, sortHint, useFolderSort } from "@/components/FolderSort";
import { onAiJobDone, runAiJob, useAiJobs, useSecondsSince } from "@/lib/ai-jobs";
import { linkKey } from "@/lib/links";
import { createClient } from "@/lib/supabase/client";
import type { Article, ArticleCategory, SectionKind } from "@/lib/types";
import { askArticleAi } from "@/lib/video-ai";
import { askConfirm } from "./ConfirmDialog";

type AiNote = { articleId: string; note: string; model?: string };
const aiNoteKey = (articleId: string) => `article-note:${articleId}`;

type View = { kind: "all" } | { kind: "uncategorized" } | { kind: "category"; id: string };
export type Period = "any" | "week" | "month" | "year";
type ReadFilter = "all" | "unread" | "read";

export const PERIODS: { value: Period; label: string; days: number }[] = [
  { value: "any", label: "Any time", days: 0 },
  { value: "week", label: "Past week", days: 7 },
  { value: "month", label: "Past month", days: 31 },
  { value: "year", label: "Past year", days: 366 },
];

// Longest personal note on an article: about the length of an X post.
export const NOTE_MAX = 280;

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

// Reading and Tutorials work the same way; each has its own links and categories.
export const SECTIONS: Record<
  SectionKind,
  { path: string; icon: string; name: string; all: string; list: string; placeholder: string; example: string }
> = {
  reading: {
    path: "/reading",
    icon: "📄",
    name: "Reading",
    all: "All reading",
    list: "reading list",
    placeholder: "Paste a link to an X post or article…",
    example: "an X post or a blog article",
  },
  tutorial: {
    path: "/tutorials",
    icon: "🎓",
    name: "Tutorials",
    all: "All tutorials",
    list: "tutorials list",
    placeholder: "Paste a link to a tutorial…",
    example: "a how-to guide or a course page",
  },
};

export default function ReadingLibrary({ userEmail, kind }: { userEmail: string; kind: SectionKind }) {
  const section = SECTIONS[kind];
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [categories, setCategories] = useState<ArticleCategory[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const aiJobs = useAiJobs();
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [view, setView] = useState<View>({ kind: "all" });
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState<Period>("any");
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [showCategories, setShowCategories] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingCategoryId, setDraggingCategoryId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const [toast, setToast] = useState<{ text: string; isError?: boolean } | null>(null);

  const notify = useCallback((text: string, isError = false) => {
    setToast({ text, isError });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    const [c, a] = await Promise.all([
      supabase.from("article_categories").select("*").eq("kind", kind).order("position").order("name"),
      supabase.from("articles").select("*").eq("kind", kind).order("created_at", { ascending: false }),
    ]);
    const error = c.error ?? a.error;
    if (error) {
      // Before supabase/articles.sql has been run, the tables don't exist yet.
      if (/does not exist|schema cache/i.test(error.message)) setNeedsSetup(true);
      else notify(error.message, true);
    } else {
      setCategories(c.data as ArticleCategory[]);
      setArticles(a.data as Article[]);
    }
    setLoading(false);
  }, [supabase, notify, kind]);

  useEffect(() => {
    load();
  }, [load]);

  // ---------- Category helpers ----------

  const [folderSort, setFolderSort] = useFolderSort();
  const topCategories = useMemo(
    () => categories.filter((c) => !c.parent_id).sort(compareFolders(folderSort)),
    [categories, folderSort],
  );
  const subcategories = useCallback(
    (parentId: string) => categories.filter((c) => c.parent_id === parentId).sort(compareFolders(folderSort)),
    [categories, folderSort],
  );

  const categoryPath = useCallback(
    (id: string | null) => {
      const cat = categories.find((c) => c.id === id);
      if (!cat) return "";
      const parent = categories.find((c) => c.id === cat.parent_id);
      return parent ? `${parent.name} › ${cat.name}` : cat.name;
    },
    [categories],
  );

  // Every category in order, for the "Category" menus.
  const categoryOptions = useMemo(
    () =>
      topCategories.flatMap((c) => [
        { id: c.id, label: c.name },
        ...subcategories(c.id).map((s) => ({ id: s.id, label: `  ${s.name}` })),
      ]),
    [topCategories, subcategories],
  );

  const canDragCategories = folderSort === "custom";
  const categorySiblings = (category: ArticleCategory) =>
    category.parent_id ? subcategories(category.parent_id) : topCategories;

  const currentCategory = view.kind === "category" ? categories.find((c) => c.id === view.id) ?? null : null;

  // A category shows its own articles plus those in its subcategories.
  const inCategory = useCallback(
    (article: Article, id: string) =>
      article.category_id === id || categories.some((c) => c.id === article.category_id && c.parent_id === id),
    [categories],
  );

  // ---------- Which articles to show ----------

  const searching = query.trim().length > 0;
  // Inside a category your own order applies; All reading and search show the newest first.
  const canReorder = !searching && view.kind !== "all";

  const visibleArticles = useMemo(() => {
    const q = query.trim().toLowerCase();
    const days = PERIODS.find((p) => p.value === period)!.days;
    const since = days ? Date.now() - days * 86_400_000 : 0;
    const shown = articles.filter((a) => {
      if (since && new Date(a.created_at).getTime() < since) return false;
      if (readFilter === "read" && !a.read_at) return false;
      if (readFilter === "unread" && a.read_at) return false;
      if (q) return [a.title, a.site, a.author, a.url, a.note, categoryPath(a.category_id)].some((s) => s?.toLowerCase().includes(q));
      if (view.kind === "uncategorized") return !a.category_id;
      if (view.kind === "category") return inCategory(a, view.id);
      return true;
    });
    const newestFirst = (a: Article, b: Article) => b.created_at.localeCompare(a.created_at);
    return shown.sort(canReorder ? (a, b) => a.position - b.position || newestFirst(a, b) : newestFirst);
  }, [articles, query, period, readFilter, view, categoryPath, inCategory, canReorder]);

  const countIn = (id: string) => articles.filter((a) => inCategory(a, id)).length;

  // ---------- Article actions ----------

  // The position that puts an article first in a category.
  const topPosition = (categoryId: string | null, exceptId?: string) => {
    const siblings = articles.filter((a) => a.category_id === categoryId && a.id !== exceptId);
    return siblings.length ? Math.min(...siblings.map((a) => a.position)) - 1 : 0;
  };

  const findSaved = (link: string) => {
    const key = linkKey(link);
    return key ? articles.find((a) => linkKey(a.url) === key) : undefined;
  };

  // A link that's already saved isn't added twice: it gets today's date and moves to the top of its category.
  function bringToTop(existing: Article) {
    updateArticle(existing.id, {
      created_at: new Date().toISOString(),
      position: topPosition(existing.category_id, existing.id),
    });
    notify(`Already saved in ${categoryPath(existing.category_id) || "Uncategorized"}. Moved it to the top.`);
  }

  async function addArticle(link: string, categoryId: string | null) {
    const saved = findSaved(link);
    if (saved) {
      bringToTop(saved);
      return true;
    }

    const res = await fetch(`/api/article-info?url=${encodeURIComponent(link)}`);
    const info = await res.json();
    if (!res.ok) {
      notify(info.error ?? "Couldn't read that link.", true);
      return false;
    }

    // The site may have redirected to a link that's already saved.
    const existing = findSaved(info.url);
    if (existing) {
      bringToTop(existing);
      return true;
    }

    let title: string | null = info.title;
    if (!title) {
      title = window.prompt("This site didn't share its title. Type one:", info.site ?? "")?.trim() || null;
      if (!title) return false;
    }

    const { data, error } = await supabase
      .from("articles")
      .insert({
        url: info.url,
        title,
        site: info.site,
        author: info.author,
        category_id: categoryId,
        position: topPosition(categoryId),
        kind,
      })
      .select()
      .single();
    if (error) {
      notify(error.message, true);
      return false;
    }
    setArticles((prev) => [data as Article, ...prev]);
    notify(`Saved "${title}"`);
    writeAiNote(data as Article);
    return true;
  }

  // Asks the AI to read the page and fill in its note. New links do this on their own; if it
  // fails, the reason shows on the row until the next try. It keeps going, and saves the note,
  // even if the person moves to another tab meanwhile.
  function writeAiNote(article: Article) {
    runAiJob<AiNote>({
      key: aiNoteKey(article.id),
      label: `AI note for "${article.title ?? article.site ?? "your link"}"`,
      work: async () => {
        const result = await askArticleAi({ url: article.url, title: article.title, kind });
        if (result.error) return result.code === "no-key" ? {} : { error: result.error };
        if (!result.text) return {};
        // Only fills an empty note, so a note typed while the AI was working stays.
        const { data, error } = await supabase
          .from("articles")
          .update({ note: result.text })
          .eq("id", article.id)
          .eq("note", "")
          .select("id");
        if (error) return { error: error.message };
        return data.length ? { result: { articleId: article.id, note: result.text, model: result.model } } : {};
      },
    });
  }

  // Shows a finished AI note right away when this list is open.
  useEffect(
    () =>
      onAiJobDone((key, result) => {
        if (!key.startsWith("article-note:")) return false;
        const { articleId, note, model } = result as AiNote;
        setArticles((prev) => prev.map((a) => (a.id === articleId ? { ...a, note } : a)));
        if (model) notify(`Note written by ${model}`);
        return true;
      }),
    [notify],
  );

  async function updateArticle(id: string, changes: Partial<Article>) {
    setArticles((prev) => prev.map((a) => (a.id === id ? { ...a, ...changes } : a)));
    const { error } = await supabase.from("articles").update(changes).eq("id", id);
    if (error) {
      notify(error.message, true);
      load();
    }
  }

  function moveArticle(id: string, categoryId: string | null) {
    const article = articles.find((a) => a.id === id);
    if (!article || article.category_id === categoryId) return;
    updateArticle(id, { category_id: categoryId, position: topPosition(categoryId) });
    notify(`Moved to ${categoryPath(categoryId) || "Uncategorized"}`);
  }

  // Drop one article onto another: it takes the target's place in the list.
  function reorderArticle(draggedId: string, targetId: string) {
    if (draggedId === targetId) return;
    const list = visibleArticles.filter((a) => a.id !== draggedId);
    const index = list.findIndex((a) => a.id === targetId);
    if (index === -1) return;
    const target = list[index];
    const before = list[index - 1];
    updateArticle(draggedId, { position: before ? (before.position + target.position) / 2 : target.position - 1 });
  }

  // Swap an article with its neighbor: -1 moves it up, +1 down.
  function shiftArticle(id: string, step: -1 | 1) {
    const index = visibleArticles.findIndex((a) => a.id === id);
    const neighbor = visibleArticles[index + step];
    if (index === -1 || !neighbor) return;
    const article = visibleArticles[index];
    if (article.position === neighbor.position) {
      // Equal positions can't be swapped, so nudge just past the neighbor instead.
      updateArticle(article.id, { position: neighbor.position + step * 0.5 });
      return;
    }
    updateArticle(article.id, { position: neighbor.position });
    updateArticle(neighbor.id, { position: article.position });
  }

  function toggleRead(article: Article) {
    updateArticle(article.id, { read_at: article.read_at ? null : new Date().toISOString() });
  }

  function renameArticle(article: Article) {
    const title = window.prompt("Title:", article.title ?? "")?.trim();
    if (!title || title === article.title) return;
    updateArticle(article.id, { title });
  }

  async function deleteArticle(article: Article) {
    const ok = await askConfirm({
      title: `Delete this from your ${section.list}?`,
      quote: article.title ?? article.url,
      message: "The link and its note will be gone for good.\n\nOnly want to remove the note? Choose Keep it, then use 🧹 Clear note.",
      confirmLabel: "Yes, delete",
      cancelLabel: "Keep it",
      danger: true,
    });
    if (!ok) return;
    setArticles((prev) => prev.filter((a) => a.id !== article.id));
    const { error } = await supabase.from("articles").delete().eq("id", article.id);
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
      .insert({ name: name.slice(0, 100), parent_id: parentId, position, kind })
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
    // Dragging down puts it after the target; dragging up puts it before.
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

  function openCategoryMenu(category: ArticleCategory, e: React.MouseEvent) {
    e.preventDefault();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: "✏️ Rename", onClick: () => renameCategory(category) },
        ...(category.parent_id ? [] : [{ label: "🏷️ New subcategory", onClick: () => createCategory(category.id) }]),
        { label: "🗑 Delete", onClick: () => deleteCategory(category), danger: true },
      ],
    });
  }

  // What happens when something is dropped on a category: an article moves into it,
  // a category next to it takes its place.
  const dropOnCategory = (category: ArticleCategory) => {
    if (draggingId) return () => moveArticle(draggingId, category.id);
    const dragged = categories.find((c) => c.id === draggingCategoryId);
    if (dragged && dragged.id !== category.id && dragged.parent_id === category.parent_id) {
      return () => moveCategoryTo(dragged.id, category.id);
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
    const subs = category.parent_id ? "" : " and its subcategories";
    const ok = window.confirm(
      `Delete "${category.name}"${subs}?\nThe articles inside will move to Uncategorized, not be deleted.`,
    );
    if (!ok) return;
    const { error } = await supabase.from("article_categories").delete().eq("id", category.id);
    if (error) return notify(error.message, true);
    setView({ kind: "all" });
    load();
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
      ? section.all
      : view.kind === "uncategorized"
        ? "Uncategorized"
        : categoryPath(view.id);

  const filtered = period !== "any" || readFilter !== "all";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <button
          className="rounded-md border border-slate-300 px-2 py-1 text-sm md:hidden"
          onClick={() => setShowCategories((s) => !s)}
        >
          {showCategories ? "Close" : "Categories"}
        </button>
        <span className="hidden text-lg font-bold sm:inline">📚 Learning Library</span>
        <SectionSwitch active={kind} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search titles, sites, notes…"
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
          className={`${showCategories ? "fixed inset-x-0 top-[57px] bottom-0 z-10 block" : "hidden"} w-full overflow-y-auto border-r border-slate-200 bg-white p-3 md:sticky md:top-[57px] md:block md:h-[calc(100vh-57px)] md:w-72`}
        >
          <NavItem label={`${section.icon} ${section.all}`} count={articles.length} active={view.kind === "all" && !searching} onClick={() => openView({ kind: "all" })} />
          <NavItem
            label="📥 Uncategorized"
            count={articles.filter((a) => !a.category_id).length}
            active={view.kind === "uncategorized" && !searching}
            onClick={() => openView({ kind: "uncategorized" })}
            onDropArticle={draggingId ? () => moveArticle(draggingId, null) : undefined}
          />

          <div className="mt-4 mb-1 flex items-center justify-between px-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Categories
            <FolderSortSelect sort={folderSort} onChange={setFolderSort} />
            <button onClick={() => createCategory(null)} className="rounded px-1.5 text-base text-slate-700 hover:bg-slate-100" title="New category">
              +
            </button>
          </div>
          {topCategories.length === 0 && (
            <p className="px-2 text-sm text-slate-500">No categories yet. Click + to make one, like &quot;AI news&quot;.</p>
          )}
          {topCategories.map((cat) => (
            <div key={cat.id}>
              <NavItem
                label={`🏷️ ${cat.name}`}
                count={countIn(cat.id)}
                active={!searching && view.kind === "category" && view.id === cat.id}
                onClick={() => openView({ kind: "category", id: cat.id })}
                onDropArticle={dropOnCategory(cat)}
                onDragStart={canDragCategories ? () => setDraggingCategoryId(cat.id) : undefined}
                onDragEnd={() => setDraggingCategoryId(null)}
                onContextMenu={(e) => openCategoryMenu(cat, e)}
              />
              {subcategories(cat.id).map((sub) => (
                <NavItem
                  key={sub.id}
                  label={sub.name}
                  count={countIn(sub.id)}
                  indent={1}
                  active={!searching && view.kind === "category" && view.id === sub.id}
                  onClick={() => openView({ kind: "category", id: sub.id })}
                  onDropArticle={dropOnCategory(sub)}
                  onDragStart={canDragCategories ? () => setDraggingCategoryId(sub.id) : undefined}
                  onDragEnd={() => setDraggingCategoryId(null)}
                  onContextMenu={(e) => openCategoryMenu(sub, e)}
                />
              ))}
            </div>
          ))}
          {topCategories.length > 1 && (
            <p className="mt-3 px-2 text-xs text-slate-400">{sortHint(folderSort, "categories")}</p>
          )}

          <button onClick={signOut} className="mt-6 px-2 text-sm text-slate-500 underline sm:hidden">
            Sign out
          </button>
        </aside>

        <main className="min-w-0 flex-1 p-4 md:p-6">
          {needsSetup ? (
            <SetupNotice />
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <h1 className="mr-auto text-2xl font-bold">{title}</h1>
                {currentCategory && !searching && (
                  <>
                    {!currentCategory.parent_id && (
                      <SmallButton onClick={() => createCategory(currentCategory.id)}>+ Subcategory</SmallButton>
                    )}
                    <SmallButton onClick={() => renameCategory(currentCategory)}>Rename</SmallButton>
                    <SmallButton onClick={() => deleteCategory(currentCategory)} danger>
                      Delete
                    </SmallButton>
                  </>
                )}
              </div>

              {!searching && (
                <AddArticleForm
                  key={view.kind === "category" ? view.id : view.kind}
                  onAdd={addArticle}
                  defaultCategoryId={view.kind === "category" ? view.id : null}
                  categoryOptions={categoryOptions}
                  placeholder={section.placeholder}
                />
              )}

              <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
                <Pills
                  value={period}
                  onChange={setPeriod}
                  options={PERIODS.map((p) => ({ value: p.value, label: p.label }))}
                  label="Added"
                />
                <Pills
                  value={readFilter}
                  onChange={setReadFilter}
                  options={[
                    { value: "all", label: "All" },
                    { value: "unread", label: "Unread" },
                    { value: "read", label: "✓ Read" },
                  ]}
                  label="Show"
                />
              </div>

              {loading ? (
                <p className="text-slate-500">Loading your {section.list}…</p>
              ) : visibleArticles.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-500">
                  {searching || filtered
                    ? "Nothing matches. Try another search or a longer time range."
                    : articles.length
                      ? "Nothing here yet. Paste a link above, or move articles in from another category."
                      : `Your ${section.list} is empty. Paste a link above, like ${section.example}.`}
                </div>
              ) : (
                <>
                {visibleArticles.length > 1 && (
                  <p className="mb-3 text-xs text-slate-500">
                    {canReorder
                      ? "Tip: drag an article onto another, or use ▲ ▼, to change the order. Drop it on a category to move it."
                      : `${searching ? "Search results" : section.all} show the newest first. To change the order, open a category on the left.`}
                  </p>
                )}
                <ul className="flex flex-col gap-2">
                  {visibleArticles.map((article, index) => (
                    <ArticleRow
                      key={article.id}
                      article={article}
                      categoryLabel={categoryPath(article.category_id) || "Uncategorized"}
                      categoryOptions={categoryOptions}
                      onToggleRead={() => toggleRead(article)}
                      onMove={(categoryId) => moveArticle(article.id, categoryId)}
                      canReorder={canReorder}
                      dragging={draggingId === article.id}
                      onDragStart={() => setDraggingId(article.id)}
                      onDragEnd={() => setDraggingId(null)}
                      onDropOnto={() => draggingId && reorderArticle(draggingId, article.id)}
                      onShift={canReorder ? (step) => shiftArticle(article.id, step) : null}
                      isFirst={index === 0}
                      isLast={index === visibleArticles.length - 1}
                      onRename={() => renameArticle(article)}
                      onSaveNote={(note) => updateArticle(article.id, { note })}
                      aiNoteStartedAt={aiJobs.running.find((j) => j.key === aiNoteKey(article.id))?.startedAt ?? null}
                      aiNoteError={aiJobs.errors.get(aiNoteKey(article.id)) ?? null}
                      onAiNote={() => writeAiNote(article)}
                      onDelete={() => deleteArticle(article)}
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

// The Videos | Reading | Tutorials | ScrapBook switch in the header of every section.
export function SectionSwitch({ active }: { active: "videos" | SectionKind | "scrap" | "vault" }) {
  const tab = (on: boolean) =>
    `rounded-md px-2.5 py-1 text-sm font-medium ${on ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`;
  return (
    <nav className="flex shrink-0 rounded-lg bg-slate-100 p-0.5">
      <Link href="/" className={tab(active === "videos")} title="Videos">
        🎬<span className="hidden sm:inline"> Videos</span>
      </Link>
      {(Object.keys(SECTIONS) as SectionKind[]).map((k) => (
        <Link key={k} href={SECTIONS[k].path} className={tab(active === k)} title={SECTIONS[k].name}>
          {SECTIONS[k].icon}
          <span className="hidden sm:inline"> {SECTIONS[k].name}</span>
        </Link>
      ))}
      <Link href="/scrapbook" className={tab(active === "scrap")} title="ScrapBook">
        📒<span className="hidden sm:inline"> ScrapBook</span>
      </Link>
      <Link href="/vault" className={tab(active === "vault")} title="Vault">
        🔐<span className="hidden sm:inline"> Vault</span>
      </Link>
    </nav>
  );
}

// The green tick: filled when read, an empty circle when not. Tapping it switches.
export function ReadCheck({ read, onClick }: { read: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={read ? "Read. Tap to mark unread." : "Not read yet. Tap to mark read."}
      aria-label={read ? "Mark unread" : "Mark read"}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold ${read ? "border-green-600 bg-green-600 text-white" : "border-slate-300 text-transparent hover:border-green-500"}`}
    >
      ✓
    </button>
  );
}

function ArticleRow(props: {
  article: Article;
  categoryLabel: string;
  categoryOptions: { id: string; label: string }[];
  onToggleRead: () => void;
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
  onSaveNote: (note: string) => void;
  aiNoteStartedAt: number | null;
  aiNoteError: string | null;
  onAiNote: () => void;
  onDelete: () => void;
}) {
  const { article } = props;
  const [editingNote, setEditingNote] = useState(false);
  const [over, setOver] = useState(false);
  return (
    <li
      draggable={!editingNote}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", article.id);
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
      className={`flex cursor-grab items-start gap-3 rounded-xl border bg-white p-3 shadow-sm transition ${props.dragging ? "opacity-40" : ""} ${over ? "border-blue-500 ring-2 ring-blue-500" : "border-slate-200"}`}
    >
      <ReadCheck read={Boolean(article.read_at)} onClick={props.onToggleRead} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link href={`/read/${article.id}`} className={`line-clamp-2 font-medium hover:underline ${article.read_at ? "text-slate-500" : ""}`}>
          {article.title || article.url}
        </Link>
        <p className="text-xs text-slate-500">
          {[article.site, article.author].filter(Boolean).join(" · ")}
          {" · "}Added {formatDate(article.created_at)}
          {article.read_at && <span className="text-green-700"> · Read {formatDate(article.read_at)}</span>}
        </p>
        <ArticleNote
          note={article.note}
          editing={editingNote}
          setEditing={setEditingNote}
          onSave={props.onSaveNote}
        />
        {props.aiNoteError && !article.note && (
          <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700 ring-1 ring-red-200">⚠️ {props.aiNoteError}</p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <select
            value={article.category_id ?? ""}
            onChange={(e) => props.onMove(e.target.value || null)}
            className="max-w-48 min-w-0 rounded-md border border-slate-300 bg-white px-1 py-1 text-xs"
            aria-label="Category"
            title={props.categoryLabel}
          >
            <option value="">📥 Uncategorized</option>
            {props.categoryOptions.map((c) => (
              <option key={c.id} value={c.id}>
                🏷️ {c.label}
              </option>
            ))}
          </select>
          <a
            href={article.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
          >
            Original ↗
          </a>
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
          {!article.note && !editingNote && <SmallButton onClick={() => setEditingNote(true)}>📝 Add note</SmallButton>}
          {article.note && !editingNote && (
            <SmallButton
              onClick={async () => {
                const ok = await askConfirm({
                  title: "Clear this note?",
                  quote: article.note,
                  message: "Only the note goes away. The link stays in your list.",
                  confirmLabel: "Yes, clear note",
                  cancelLabel: "Keep it",
                });
                if (ok) props.onSaveNote("");
              }}
            >
              🧹 Clear note
            </SmallButton>
          )}
          {!article.note && !editingNote && props.aiNoteStartedAt === null && (
            <SmallButton onClick={props.onAiNote} title="Let AI read the page and write the note">
              ✨ AI note
            </SmallButton>
          )}
          {!article.note && props.aiNoteStartedAt !== null && <AiNoteWorking startedAt={props.aiNoteStartedAt} />}
          <SmallButton onClick={props.onRename}>Edit title</SmallButton>
          {/* Kept apart from the note buttons so it isn't pressed by mistake. */}
          <span className="ml-auto pl-3">
            <SmallButton onClick={props.onDelete} danger title="Delete">
              🗑 Delete
            </SmallButton>
          </span>
        </div>
      </div>
    </li>
  );
}

// Shown in place of the ✨ AI note button while the AI writes the note.
export function AiNoteWorking({ startedAt }: { startedAt: number }) {
  const seconds = useSecondsSince(startedAt);
  return (
    <span className="flex items-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-xs text-violet-800">
      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-violet-300 border-t-violet-700" />
      Writing note… {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
    </span>
  );
}

// A short note to yourself: shown in yellow under the title, tap it to change it.
export function ArticleNote(props: {
  note: string;
  editing: boolean;
  setEditing: (editing: boolean) => void;
  onSave: (note: string) => void;
}) {
  // Rows can lack a note until the SQL that adds the column has been run.
  const current = props.note ?? "";
  const [draft, setDraft] = useState(current);

  useEffect(() => {
    if (props.editing) setDraft(current);
  }, [props.editing, current]);

  function save() {
    const note = draft.trim().slice(0, NOTE_MAX);
    if (note !== current) props.onSave(note);
    props.setEditing(false);
  }

  if (props.editing) {
    return (
      <div className="flex flex-col gap-1">
        <textarea
          autoFocus
          value={draft}
          maxLength={NOTE_MAX}
          rows={2}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              save();
            } else if (e.key === "Escape") props.setEditing(false);
          }}
          placeholder="Why you saved this, or what to remember…"
          className="w-full rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-sm"
        />
        <div className="flex items-center gap-1">
          <span className={`mr-auto text-xs ${draft.length >= NOTE_MAX ? "text-red-600" : "text-slate-400"}`}>
            {draft.length}/{NOTE_MAX}
          </span>
          {(current || draft) && (
            <SmallButton
              onClick={async () => {
                // Nothing saved yet: just empty the box.
                if (!current) return setDraft("");
                const ok = await askConfirm({
                  title: "Clear this note?",
                  quote: current,
                  message: "Only the note goes away. The article stays in your list.",
                  confirmLabel: "Yes, clear note",
                  cancelLabel: "Keep it",
                });
                if (!ok) return;
                props.onSave("");
                props.setEditing(false);
              }}
            >
              🧹 Clear note
            </SmallButton>
          )}
          <SmallButton onClick={() => props.setEditing(false)}>Cancel</SmallButton>
          <button
            onClick={save}
            className="rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-700"
          >
            Save note
          </button>
        </div>
      </div>
    );
  }

  if (!current) return null;
  return (
    <button
      onClick={() => props.setEditing(true)}
      title="Tap to edit your note"
      className="rounded-md bg-amber-50 px-2 py-1 text-left text-sm whitespace-pre-wrap text-slate-700 hover:bg-amber-100"
    >
      📝 {current}
    </button>
  );
}

function AddArticleForm(props: {
  onAdd: (link: string, categoryId: string | null) => Promise<boolean>;
  defaultCategoryId: string | null;
  categoryOptions: { id: string; label: string }[];
  placeholder: string;
}) {
  const [link, setLink] = useState("");
  const [categoryId, setCategoryId] = useState(props.defaultCategoryId ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!link.trim()) return;
    setBusy(true);
    if (await props.onAdd(link.trim(), categoryId || null)) setLink("");
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="mb-4 flex flex-col gap-2 sm:flex-row">
      <input
        value={link}
        onChange={(e) => setLink(e.target.value)}
        placeholder={props.placeholder}
        className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2"
      />
      <select
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm sm:max-w-48"
        aria-label="Save to category"
      >
        <option value="">📥 Uncategorized</option>
        {props.categoryOptions.map((c) => (
          <option key={c.id} value={c.id}>
            🏷️ {c.label}
          </option>
        ))}
      </select>
      <button
        disabled={busy}
        className="rounded-md bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {busy ? "Adding…" : "Add"}
      </button>
    </form>
  );
}

export function Pills<T extends string>(props: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-xs text-slate-500">{props.label}:</span>
      {props.options.map((o) => (
        <button
          key={o.value}
          onClick={() => props.onChange(o.value)}
          className={`rounded-full border px-2.5 py-0.5 text-xs whitespace-nowrap ${props.value === o.value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700 hover:bg-slate-100"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function NavItem(props: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  indent?: number;
  onDropArticle?: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <button
      onClick={props.onClick}
      draggable={Boolean(props.onDragStart)}
      onDragStart={(e) => {
        if (!props.onDragStart) return;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", props.label);
        props.onDragStart();
      }}
      onDragEnd={props.onDragEnd}
      onContextMenu={props.onContextMenu}
      onDragOver={(e) => {
        if (!props.onDropArticle) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        props.onDropArticle?.();
      }}
      className={`flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-sm ${props.active ? "bg-slate-900 text-white" : "hover:bg-slate-100"} ${over ? "ring-2 ring-blue-500" : ""}`}
      style={{ paddingLeft: 8 + (props.indent ?? 0) * 22 }}
    >
      <span className="truncate">{props.label}</span>
      {props.count !== undefined && (
        <span className={`ml-auto text-xs ${props.active ? "text-slate-300" : "text-slate-400"}`}>{props.count}</span>
      )}
    </button>
  );
}

export function SmallButton({
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

export function SetupNotice({ file = "articles.sql" }: { file?: string }) {
  return (
    <div className="max-w-xl rounded-xl border border-amber-300 bg-amber-50 p-5 text-slate-800">
      <h2 className="mb-2 text-lg font-semibold">One quick setup step</h2>
      <p>
        This section needs the latest database setup. In Supabase, open <b>SQL Editor</b> → <b>New query</b>, paste the
        whole <code>supabase/{file}</code> file, and click <b>Run</b>. Then reload this page.
      </p>
    </div>
  );
}
