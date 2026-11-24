"use client";

import AiUsageLink from "@/components/AiUsageLink";
import AiModelTag from "@/components/AiModelTag";
import { deleteItem } from "@/lib/delete-item";
import { friendlyError } from "@/lib/errors";
import { fetchAll } from "@/lib/fetch-all";
import SearchBox from "@/components/SearchBox";
import FoundElsewhere, { useSearchFromLink } from "@/components/FoundElsewhere";
import { allTags, tagWithAi } from "@/lib/ai-tags";
import { FoundIn, Highlight, SearchBar, type SearchScope } from "@/components/SearchHighlight";
import { TAGS_LABEL, bestFirst, hashTag, matches, tagTest, notesText, prepare, queryWords, whereFound, type SearchMatch, type SearchWord } from "@/lib/search";
import { revealById } from "@/lib/reveal";
import StopAiButton from "@/components/StopAiButton";
import { AskCategoryButton } from "@/components/CategoryChat";
import { Tour, TourButton, useSectionTour } from "@/components/Tour";
import BrandMark from "@/components/BrandMark";
import Link from "next/link";
import CategoryTag from "@/components/CategoryTag";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePointerDrag } from "@/lib/pointer-drag";
import { isWithin, treeOptions, treePath } from "@/lib/category-tree";
import CategoryTree from "@/components/CategoryTree";
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
import { aiJobHooks, onAiJobDone, runAiJob, stillWorkingNote, useAiJobs, useSecondsSince } from "@/lib/ai-jobs";
import { findSavedElsewhere } from "@/lib/find-saved";
import { linkKey } from "@/lib/links";
import { createClient } from "@/lib/supabase/client";
import type { Article, ArticleCategory, SectionKind } from "@/lib/types";
import { hasWriting } from "@/lib/note-mode";
import { askArticleAi } from "@/lib/video-ai";
import { askConfirm, askText } from "./ConfirmDialog";
import FilterMenu from "@/components/FilterMenu";
import { Ico, type Tone } from "./Icon";
import { Brush, FilePen, ExternalLink, FileText, GraduationCap, Inbox, LockKeyhole, NotebookPen, NotebookText, Pencil, PencilLine, Clapperboard, Sparkles, Tag, Trash2, TriangleAlert, type LucideIcon, ArrowUp, Copy, Eye, Link2, Link2Off } from "lucide-react";
import MoreMenu from "@/components/MoreMenu";
import TagPills from "@/components/TagPills";
import { askTags } from "@/lib/tags";
import { SectionWelcome } from "./GettingStarted";

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
  { path: string; name: string; all: string; list: string; placeholder: string; example: string }
> = {
  reading: {
    path: "/reading",
    name: "Reading",
    all: "All reading",
    list: "reading list",
    placeholder: "Paste a link to an X post or article…",
    example: "an X post or a blog article",
  },
  tutorial: {
    path: "/tutorials",
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
  useSearchFromLink(setQuery);
  // Clicking a tag shows every link with exactly that tag.
  const [tag, setTag] = useState<string | null>(null);
  // Inside a category, search can look only there or in the whole tab.
  const [scope, setScope] = useState<SearchScope>("everywhere");
  const [period, setPeriod] = useState<Period>("any");
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [showCategories, setShowCategories] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingCategoryId, setDraggingCategoryId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const [toast, setToast] = useState<Toast | null>(null);
  const tour = useSectionTour("articles", !loading);
  // The row that was just found as a duplicate, shown with a ring for a few seconds.
  const [flashId, setFlashId] = useState<string | null>(null);

  const notify = useCallback((text: string, isError = false) => {
    setToast({ text, isError });
    setTimeout(() => setToast(null), 3500);
  }, []);
  const warn = useCallback((text: string, href?: string) => {
    setToast({ text, warn: true, href });
    setTimeout(() => setToast(null), 8000);
  }, []);

  const load = useCallback(async () => {
    const [c, a] = await Promise.all([
      fetchAll((from, to) => supabase.from("article_categories").select("*").eq("kind", kind).order("position").order("name").order("id").range(from, to)),
      fetchAll((from, to) => supabase.from("articles").select("*").eq("kind", kind).order("created_at", { ascending: false }).order("id").range(from, to)),
    ]);
    const error = c.error ?? a.error;
    if (error) {
      // Before supabase/articles.sql has been run, the tables don't exist yet.
      if (/does not exist|schema cache/i.test(error.message)) setNeedsSetup(true);
      else notify(friendlyError(error.message), true);
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
  const currentCategory = view.kind === "category" ? categories.find((c) => c.id === view.id) ?? null : null;

  // A category shows its own articles plus those in every category inside it.
  const inCategory = useCallback(
    (article: Article, id: string) => isWithin(categories, article.category_id, id),
    [categories],
  );

  // ---------- Which articles to show ----------

  // Searching covers typed words and a tag clicked on a card.
  const searching = query.trim().length > 0 || tag !== null;
  // Inside a category your own order applies; All reading and search show the newest first.
  // Dragging to reorder works inside a folder whatever the sort; ▲ ▼ only in your own order.
  const canReorder = !searching && view.kind !== "all";
  const canShift = canReorder && itemSort === "custom";

  // "#react" in the search box filters by tag instead of searching words.
  const typedTag = useMemo(() => hashTag(query), [query]);
  const words = useMemo(() => (typedTag === null ? queryWords(query) : []), [query, typedTag]);
  // Everything search looks at for each link, prepared once rather than on every key press.
  const searchIndex = useMemo(
    () =>
      new Map(
        articles.map((a) => [
          a.id,
          prepare([
            { label: "Title", text: a.title || a.url },
            { label: "the site", text: [a.site, a.author].filter(Boolean).join(" · ") },
            { label: "the summary", text: a.note },
            { label: "your notes", text: notesText(a.notes) },
            { label: "the category", text: categoryPath(a.category_id) },
            { label: TAGS_LABEL, text: allTags(a).join(", ") },
            { label: "the link", text: a.url },
          ]),
        ]),
      ),
    [articles, categoryPath],
  );

  const visibleArticles = useMemo(() => {
    const days = PERIODS.find((p) => p.value === period)!.days;
    const since = days ? Date.now() - days * 86_400_000 : 0;
    const tagOk = tagTest(tag, typedTag);
    const shown = articles.filter((a) => {
      if (since && new Date(a.created_at).getTime() < since) return false;
      if (readFilter === "read" && !a.read_at) return false;
      if (readFilter === "unread" && a.read_at) return false;
      if (tagOk && !tagOk(allTags(a))) return false;
      if (words.length && !matches(searchIndex.get(a.id) ?? [], words)) return false;
      // A search looks in the whole tab unless you chose only the category you're in.
      if (searching && scope === "everywhere") return true;
      if (view.kind === "uncategorized") return !a.category_id;
      if (view.kind === "category") return inCategory(a, view.id);
      return true;
    });
    const order = compareItems<Article>(searching ? "newest" : itemSort, (a) => a.title ?? a.url, !searching && view.kind !== "all");
    return shown.sort(bestFirst(words, (a) => searchIndex.get(a.id) ?? [], order));
  }, [articles, words, tag, typedTag, scope, searchIndex, period, readFilter, view, inCategory, searching, itemSort]);

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

  // A link that's already saved isn't added twice: its category opens and the saved one
  // gets a green ring for a few seconds.
  function pointAt(existing: Article) {
    openView(existing.category_id ? { kind: "category", id: existing.category_id } : { kind: "uncategorized" });
    setPeriod("any");
    setReadFilter("all");
    setFlashId(existing.id);
    setTimeout(() => setFlashId((id) => (id === existing.id ? null : id)), 4000);
  }

  function bringToTop(existing: Article) {
    const where = categoryPath(existing.category_id) || "Uncategorized";
    pointAt(existing);
    warn(`Duplicate: this is already saved here, in ${section.name} › ${where}.`);
  }

  // The same link saved in another tab (Videos, or Reading/Tutorials): go there and show it.
  async function findInOtherSection(links: string[]) {
    const found = await findSavedElsewhere(supabase, links, kind);
    if (!found) return false;
    router.push(found.href);
    return true;
  }

  // Arriving from another tab with ?show=id: point at that saved link.
  const shown = useRef(false);
  useEffect(() => {
    if (loading || shown.current) return;
    shown.current = true;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("show");
    if (!id) return;
    window.history.replaceState(null, "", section.path);
    const article = articles.find((a) => a.id === id);
    if (!article) return;
    // ?show=id&find=1 comes from the article's own page: just open its category.
    if (params.get("find")) pointAt(article);
    else bringToTop(article);
    // Runs once, when the list first loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  async function addArticle(link: string, categoryId: string | null) {
    const saved = findSaved(link);
    if (saved) {
      bringToTop(saved);
      return true;
    }
    if (await findInOtherSection([link])) return true;

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
    if (info.url !== link && (await findInOtherSection([info.url]))) return true;

    let title: string | null = info.title;
    if (!title) {
      title = await askText({ title: "This site didn't share its title. Type one:", value: info.site ?? "", confirmLabel: "Add" });
      if (!title) return false;
    }

    // With a category picked, the link goes there. Otherwise it goes into its author's
    // category (like Videos does with YouTube channels), made the first time. A page that
    // doesn't name its author goes under its company or publication, or else its website.
    let newCategory: ArticleCategory | null = null;
    const autoName: string | null = info.author || info.publisher || info.site || null;
    const autoSorted = !categoryId && Boolean(autoName);
    if (autoSorted) {
      const picked = await autoCategory(autoName!);
      if (!picked) return false;
      categoryId = picked.id;
      if (!categories.some((c) => c.id === picked.id)) newCategory = picked;
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
      notify(friendlyError(error.message), true);
      return false;
    }
    if (newCategory) setCategories((prev) => [...prev, newCategory!]);
    setArticles((prev) => [data as Article, ...prev]);
    notify(autoSorted ? `Saved to ${autoName}` : `Saved "${title}"`);
    writeAiNote(data as Article);
    // The AI adds up to 3 tags of its own, in the background.
    const added = data as Article;
    tagWithAi(supabase, kind === "tutorial" ? "tutorial" : "article", added.id, {
      title: added.title ?? added.url,
      about: [added.site, added.author].filter(Boolean).join(", "),
    }).then((ai_tags) => {
      if (ai_tags) setArticles((prev) => prev.map((a) => (a.id === added.id ? { ...a, ai_tags } : a)));
    });
    return true;
  }

  // Finds the top-level category named after an author (or a website), creating it the first time.
  async function autoCategory(label: string): Promise<ArticleCategory | null> {
    const name = label.trim().slice(0, 100);
    const existing = categories.find((c) => c.parent_id === null && c.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;

    const topLevel = categories.filter((c) => c.parent_id === null);
    const position = topLevel.length ? Math.max(...topLevel.map((c) => c.position)) + 1 : 0;
    const { data, error } = await supabase
      .from("article_categories")
      .insert({ name, parent_id: null, position, kind })
      .select()
      .single();
    if (error) {
      notify(friendlyError(error.message), true);
      return null;
    }
    return data as ArticleCategory;
  }

  // Asks the AI to read the page and fill in its note. New links do this on their own; if it
  // fails, the reason shows on the row until the next try. It keeps going, and saves the note,
  // even if the person moves to another tab meanwhile.
  function writeAiNote(article: Article) {
    runAiJob<AiNote>({
      key: aiNoteKey(article.id),
      label: `AI summary for "${article.title ?? article.site ?? "your link"}"`,
      work: async (signal) => {
        const result = await askArticleAi({ url: article.url, title: article.title, kind }, signal, aiJobHooks(aiNoteKey(article.id)));
        if (signal.aborted) return {};
        if (result.error) return result.code === "no-key" ? {} : { error: result.error };
        if (!result.text) return {};
        // Only fills an empty note, so a note typed while the AI was working stays.
        const { data, error } = await supabase
          .from("articles")
          .update({ note: result.text })
          .eq("id", article.id)
          .eq("note", "")
          .select("id");
        if (error) return { error: friendlyError(error.message) };
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
        revealById(`ai-note-${articleId}`);
        return true;
      }),
    [notify],
  );

  async function updateArticle(id: string, changes: Partial<Article>) {
    setArticles((prev) => prev.map((a) => (a.id === id ? { ...a, ...changes } : a)));
    const { error } = await supabase.from("articles").update(changes).eq("id", id);
    if (error) {
      notify(friendlyError(error.message), true);
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
    if (itemSort !== "custom") {
      // Sorted by date or name: keep the order you see, put the dragged one before the target,
      // save that as your own order and switch Sort to "My order".
      const dragged = visibleArticles.find((a) => a.id === draggedId);
      const rest = visibleArticles.filter((a) => a.id !== draggedId);
      const at = rest.findIndex((a) => a.id === targetId);
      if (!dragged || at === -1) return;
      rest.splice(at, 0, dragged);
      rest.forEach((a, position) => {
        if (a.position !== position) updateArticle(a.id, { position });
      });
      setItemSort("custom");
      return;
    }
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

  async function editArticleTags(article: Article) {
    const tags = await askTags(article.tags ?? [], notify);
    if (tags) updateArticle(article.id, { tags });
  }

  // Removing an AI tag keeps it removed: the AI doesn't tag the link again.
  function removeAiTag(article: Article, tag: string) {
    updateArticle(article.id, { ai_tags: (article.ai_tags ?? []).filter((t) => t !== tag) });
  }

  function removeArticleTag(article: Article, tag: string) {
    updateArticle(article.id, { tags: (article.tags ?? []).filter((t) => t !== tag) });
  }

  async function renameArticle(article: Article) {
    const title = await askText({ title: "Title", value: article.title ?? "", confirmLabel: "Save" });
    if (!title || title === article.title) return;
    updateArticle(article.id, { title });
  }

  async function deleteArticle(article: Article) {
    const ok = await askConfirm({
      title: `Delete this from your ${section.list}?`,
      quote: article.title ?? article.url,
      message: "The link, its summary and all your notes (typed, handwritten and pictures) will be gone for good.\n\nOnly want to remove the summary? Choose Keep it, then use Clear summary.",
      confirmLabel: "Yes, delete",
      cancelLabel: "Keep it",
      danger: true,
    });
    if (!ok) return;
    setArticles((prev) => prev.filter((a) => a.id !== article.id));
    const error = await deleteItem(supabase, "article", article.id);
    if (error) {
      notify(friendlyError(error), true);
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
    if (error) return notify(friendlyError(error.message), true);
    setCategories((prev) => [...prev, data as ArticleCategory]);
    openView({ kind: "category", id: (data as ArticleCategory).id });
  }

  // Drop a category onto another and it goes next to it, at that one's level. At the same level that just
  // changes the order; onto one at another level (its parent, say) it moves up or down to that level, just below it.
  async function moveCategoryTo(draggedId: string, targetId: string) {
    const dragged = categories.find((c) => c.id === draggedId);
    const target = categories.find((c) => c.id === targetId);
    // It can't go next to itself, or into one of its own subcategories.
    if (!dragged || !target || isWithin(categories, target.id, dragged.id)) return;
    const parent_id = target.parent_id;
    const sameLevel = dragged.parent_id === parent_id;
    const all = childCategories(parent_id);
    const siblings = all.filter((c) => c.id !== dragged.id);
    const index = siblings.findIndex((c) => c.id === target.id);
    // Same level: dragging down puts it after the target, dragging up before it.
    siblings.splice(sameLevel && all.indexOf(dragged) > index ? index : index + 1, 0, dragged);
    const changed = siblings
      .map((c, position) => ({ id: c.id, position }))
      .filter((c, i) => siblings[i].position !== c.position || (!sameLevel && c.id === dragged.id));
    setCategories((prev) =>
      prev.map((c) => {
        const m = changed.find((x) => x.id === c.id);
        if (!m) return c;
        return c.id === dragged.id ? { ...c, position: m.position, parent_id } : { ...c, position: m.position };
      }),
    );
    const results = await Promise.all(
      changed.map((c) =>
        supabase
          .from("article_categories")
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
      const into = categories.find((c) => c.id === parent_id);
      notify(into ? `Moved "${dragged.name}" into "${into.name}"` : `Moved "${dragged.name}" to the top level`);
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
      notify(friendlyError(error.message), true);
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
        { label: "Rename", icon: Pencil, tone: "amber" as const, onClick: () => renameCategory(category) },
        { label: "New subcategory", icon: Tag, tone: "amber" as const, onClick: () => createCategory(category.id) },
        ...(category.parent_id
          ? [{ label: "Move up a level", icon: ArrowUp, tone: "blue" as const, onClick: () => moveCategoryUp(category) }]
          : []),
        ...(category.share_token
          ? [
              { label: "Preview what others see", icon: Eye, tone: "blue" as const, onClick: () => previewShare(category.share_token!) },
              { label: "Copy share link", icon: Copy, tone: "blue" as const, onClick: () => copyShareLink(category.share_token!) },
              { label: "Stop sharing", icon: Link2Off, tone: "slate" as const, onClick: () => toggleShare(category) },
            ]
          : [{ label: "Share", icon: Link2, tone: "blue" as const, onClick: () => toggleShare(category) }]),
        { label: "Delete", icon: Trash2, tone: "red" as const, onClick: () => deleteCategory(category), danger: true },
      ],
    });
  }

  // What happens when something is dropped on a category: an article moves into it,
  // a category next to it takes its place.
  const dropOnCategory = (category: ArticleCategory) => {
    if (draggingId) return () => moveArticle(draggingId, category.id);
    const dragged = categories.find((c) => c.id === draggingCategoryId);
    if (dragged && !isWithin(categories, category.id, dragged.id)) {
      return () => {
        moveCategoryTo(dragged.id, category.id);
        // Dragging sets your own order, so the list switches to "My order" and keeps it.
        if (folderSort !== "custom") setFolderSort("custom");
      };
    }
    return undefined;
  };

  async function renameCategory(category: ArticleCategory) {
    const name = (await askText({ title: "Rename", value: category.name, confirmLabel: "Rename" }));
    if (!name || name === category.name) return;
    setCategories((prev) => prev.map((c) => (c.id === category.id ? { ...c, name } : c)));
    const { error } = await supabase.from("article_categories").update({ name }).eq("id", category.id);
    if (error) {
      notify(friendlyError(error.message), true);
      load();
    }
  }

  async function deleteCategory(category: ArticleCategory) {
    const ok = await askConfirm({
      title: `Delete "${category.name}" and any categories inside it?`,
      message: "The articles inside will move to Uncategorized, not be deleted.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    const { error } = await supabase.from("article_categories").delete().eq("id", category.id);
    if (error) return notify(friendlyError(error.message), true);
    setView({ kind: "all" });
    load();
  }

  // ---------- Sharing a category with a link ----------

  const shareError = (message: string) =>
    /share_token/.test(message) ? "To share categories, run supabase/share-categories.sql in Supabase first." : friendlyError(message);

  async function toggleShare(category: ArticleCategory) {
    if (category.share_token) {
      if (
        !(await askConfirm({
          title: "Turn off the share link?",
          message: "People with the old link won't be able to see it anymore.",
          confirmLabel: "Turn off",
        }))
      )
        return;
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
      await askText({ title: "Copy this share link", value: link, confirmLabel: "Done" });
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
    setTag(null);
    setShowCategories(false);
  }

  // ---------- Render ----------

  const title = searching
    ? query.trim()
      ? `Search results for "${query.trim()}"`
      : `Tagged #${tag}`
    : view.kind === "all"
      ? section.all
      : view.kind === "uncategorized"
        ? "Uncategorized"
        : categoryPath(view.id);

  const filtered = period !== "any" || readFilter !== "all";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-3 sm:gap-3">
        <button
          className="rounded-md border border-slate-300 px-2 py-1 text-sm md:hidden"
          onClick={() => setShowCategories((s) => !s)}
        >
          {showCategories ? "Close" : "Categories"}
        </button>
        <BrandMark />
        <SectionSwitch active={kind} />
        <SearchBox value={query} onChange={setQuery} placeholder="Search titles, summaries, notes…" className="ml-auto w-auto sm:w-full sm:max-w-xs" collapse recentKey={kind} />
        <AiUsageLink />
        <div className="hidden items-center gap-2 text-sm text-slate-500 sm:flex">
          <span className="hidden max-w-40 truncate lg:inline">{userEmail}</span>
          <button onClick={signOut} className="rounded-md px-2 py-1 whitespace-nowrap hover:bg-slate-100">
            Sign out
          </button>
        </div>
      </header>

      <div className="flex flex-1">
        <aside
          className={`${showCategories ? "fixed inset-x-0 top-[57px] bottom-0 z-10 block" : "hidden"} w-full overflow-y-auto border-r border-slate-200 bg-white p-3 md:sticky md:top-[57px] md:block md:h-[calc(100vh-57px)] md:w-72`}
          // Right-click the FOLDERS / CATEGORIES heading, or anywhere in the sidebar that isn't a categorie to make a new top-level one.
          onContextMenu={(e) => {
            if (e.defaultPrevented) return;
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY, items: [{ label: "New category", icon: Tag, tone: "amber" as const, onClick: () => createCategory(null) }] });
          }}
        >
          <AiUsageLink sidebar />
          <NavItem icon={kind === "tutorial" ? GraduationCap : FileText} tone={kind === "tutorial" ? "green" : "blue"} label={section.all} count={articles.length} active={view.kind === "all" && !searching} onClick={() => openView({ kind: "all" })} />
          <NavItem
            icon={Inbox}
            tone="blue"
            label="Uncategorized"
            count={articles.filter((a) => !a.category_id).length}
            active={view.kind === "uncategorized" && !searching}
            onClick={() => openView({ kind: "uncategorized" })}
            onDropArticle={draggingId ? () => moveArticle(draggingId, null) : undefined}
          />

          <SidebarHeading label="Categories">
            <FolderSortSelect sort={folderSort} onChange={setFolderSort} />
            <button onClick={() => createCategory(null)} className="rounded px-1.5 text-base text-slate-700 hover:bg-slate-100" title="New category">
              +
            </button>
          </SidebarHeading>
          {topCategories.length === 0 && (
            <p className="px-2 text-sm text-slate-500">No categories yet. Click + to make one, like &quot;AI news&quot;.</p>
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
            <SetupNotice />
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <h1 className="mr-auto text-2xl font-bold">{title}</h1>
                {currentCategory && !searching && (
                  <AskCategoryButton
                    kind="article"
                    categoryName={currentCategory.name}
                    items={[...articles]
                      .filter((a) => isWithin(categories, a.category_id, currentCategory.id))
                      .sort((a, b) => a.position - b.position)
                      .map((a) => ({ id: a.id, title: a.title || a.url }))}
                  />
                )}
                <TourButton onClick={tour.start} />
                {currentCategory && !searching && (
                  <>
                    <SmallButton onClick={() => createCategory(currentCategory.id)}>+ Subcategory</SmallButton>
                    <SmallButton onClick={() => renameCategory(currentCategory)}>Rename</SmallButton>
                    <SmallButton
                      onClick={() => toggleShare(currentCategory)}
                      icon={currentCategory.share_token ? Link2Off : Link2}
                      tone={currentCategory.share_token ? "slate" : "blue"}
                    >
                      {currentCategory.share_token ? "Stop sharing" : "Share"}
                    </SmallButton>
                    {currentCategory.share_token && (
                      <>
                        <SmallButton
                          onClick={() => previewShare(currentCategory.share_token!)}
                          icon={Eye}
                          tone="blue"
                          pill
                          title="See this category the way people with the link see it"
                        >
                          Preview
                        </SmallButton>
                        <SmallButton onClick={() => copyShareLink(currentCategory.share_token!)} icon={Copy} tone="blue">
                          Copy link
                        </SmallButton>
                      </>
                    )}
                    <SmallButton onClick={() => deleteCategory(currentCategory)} danger>
                      Delete
                    </SmallButton>
                  </>
                )}
                <FilterMenu
                  tour="read-filter"
                  groups={[
                    { label: "Added", value: period, options: PERIODS.map((p) => ({ value: p.value, label: p.label })), onChange: (v) => setPeriod(v as Period) },
                    {
                      label: "Show",
                      value: readFilter,
                      options: [
                        { value: "all", label: "All" },
                        { value: "unread", label: "Unread" },
                        { value: "read", label: "✓ Read" },
                      ],
                      onChange: (v) => setReadFilter(v as ReadFilter),
                    },
                  ]}
                />
                {/* Search results come best match first, so the sort only shows outside a search. */}
                {!searching && <ItemSortSelect sort={itemSort} onChange={setItemSort} />}
              </div>
              {searching && (
                <SearchBar
                  count={visibleArticles.length}
                  ranked={words.length > 0}
                  tag={tag}
                  onClearTag={() => setTag(null)}
                  categoryName={view.kind === "all" ? null : view.kind === "uncategorized" ? "Uncategorized" : categoryPath(view.id)}
                  scope={scope}
                  onScope={setScope}
                />
              )}


              {!searching && (
                <AddArticleForm
                  key={view.kind === "category" ? view.id : view.kind}
                  onAdd={addArticle}
                  defaultCategoryId={view.kind === "category" ? view.id : null}
                  categoryOptions={categoryOptions}
                  placeholder={section.placeholder}
                />
              )}

              {loading ? (
                <p className="text-slate-500">Loading your {section.list}…</p>
              ) : articles.length === 0 && !searching && !filtered ? (
                <SectionWelcome
                  title={kind === "tutorial" ? "Start your tutorials list" : "Start your reading list"}
                  text={`Paste a link in the box above, like ${section.example}. BrainShelf fills in the title and site for you.`}
                  features={[
                    {
                      title: "Save",
                      text: kind === "tutorial" ? "Keep every course and how-to in one place." : "Keep posts and articles from anywhere in one place.",
                    },
                    { title: "Note why", text: "Add a short note on each, so you remember what mattered." },
                    { title: "Tick it off", text: "Mark it ✓ read when you finish, or get an AI summary." },
                  ]}
                  action={{ label: "Paste your first link", target: "add-article" }}
                />
              ) : visibleArticles.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-500">
                  {searching || filtered
                    ? "Nothing matches. Try another search or a longer time range."
                    : "Nothing here yet. Paste a link above, or move articles in from another category."}
                  {searching && <FoundElsewhere query={query} here={kind === "tutorial" ? "tutorial" : "reading"} />}
                </div>
              ) : (
                <>
                {!searching && visibleArticles.length > 1 && (
                  <p className="mb-3 text-xs text-slate-500">
                    {canReorder
                      ? "Tip: drag an article onto another, or use ▲ ▼, to change the order. Drop it on a category to move it."
                      : `${section.all} show the newest first. To change the order, open a category on the left.`}
                  </p>
                )}
                <ul className="flex flex-col gap-2">
                  {visibleArticles.map((article, index) => (
                    <ArticleRow
                      key={article.id}
                      article={article}
                      words={words}
                      compact={searching}
                      found={searching ? whereFound(searchIndex.get(article.id) ?? [], words) : null}
                      categoryLabel={categoryPath(article.category_id) || "Uncategorized"}
                      showCategory={searching || view.kind !== "category"}
                      onShowCategory={() => pointAt(article)}
                      categoryOptions={categoryOptions}
                      onToggleRead={() => toggleRead(article)}
                      onMove={(categoryId) => moveArticle(article.id, categoryId)}
                      canReorder={canReorder}
                      dragging={draggingId === article.id}
                      onDragStart={() => setDraggingId(article.id)}
                      onDragEnd={() => setDraggingId(null)}
                      onDropOnto={() => draggingId && reorderArticle(draggingId, article.id)}
                      onShift={canShift ? (step) => shiftArticle(article.id, step) : null}
                      isFirst={index === 0}
                      isLast={index === visibleArticles.length - 1}
                      onRename={() => renameArticle(article)}
                      onEditTags={() => editArticleTags(article)}
                      onTagClick={(t) => {
                        setTag(t);
                        setQuery("");
                      }}
                      onRemoveTag={(tag) => removeArticleTag(article, tag)}
                      onRemoveAiTag={(tag) => removeAiTag(article, tag)}
                      onSaveNote={(note) => updateArticle(article.id, { note })}
                      aiNoteStartedAt={aiJobs.running.find((j) => j.key === aiNoteKey(article.id))?.startedAt ?? null}
                      aiNoteError={aiJobs.errors.get(aiNoteKey(article.id)) ?? null}
                      onAiNote={() => writeAiNote(article)}
                      onDelete={() => deleteArticle(article)}
                      flash={flashId === article.id}
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

      {toast && <ToastBox toast={toast} onClose={() => setToast(null)} />}
      <Tour open={tour.open} steps={tour.steps} onClose={tour.close} />
    </div>
  );
}

// ---------- Pieces ----------

// The Videos | Reading | Tutorials | ScrapBook switch in the header of every section.
// "reports" highlights no tab: Report Writer sits beside the sections, not in them.
export function SectionSwitch({ active }: { active: "videos" | SectionKind | "scrap" | "vault" | "reports" }) {
  const tab = (on: boolean) =>
    `flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm font-medium sm:px-2.5 ${on ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`;
  const items: { key: string; href: string; name: string; Icon: LucideIcon; tone: Tone }[] = [
    { key: "videos", href: "/", name: "Videos", Icon: Clapperboard, tone: "red" },
    { key: "reading", href: "/reading", name: "Reading", Icon: FileText, tone: "blue" },
    { key: "tutorial", href: "/tutorials", name: "Tutorials", Icon: GraduationCap, tone: "green" },
    { key: "scrap", href: "/scrapbook", name: "ScrapBook", Icon: NotebookPen, tone: "amber" },
    { key: "vault", href: "/vault", name: "Vault", Icon: LockKeyhole, tone: "navy" },
  ];
  return (
    <nav className="flex shrink-0 rounded-lg bg-slate-100 p-0.5">
      {items.map(({ key, href, name, Icon, tone }) => (
        <Link key={key} href={href} className={tab(active === key)} title={name}>
          <Ico icon={Icon} tone={tone} />
          <span className="hidden lg:inline">{name}</span>
        </Link>
      ))}
    </nav>
  );
}

// The green tick: filled when read, an empty circle when not. Tapping it switches.
export function ReadCheck({ read, onClick, word = "read" }: { read: boolean; onClick: () => void; word?: string }) {
  const done = word.charAt(0).toUpperCase() + word.slice(1);
  return (
    <button
      onClick={onClick}
      title={read ? `${done}. Tap to mark not ${word}.` : `Not ${word} yet. Tap to mark ${word}.`}
      aria-label={read ? `Mark not ${word}` : `Mark ${word}`}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold ${read ? "border-green-600 bg-green-600 text-white" : "border-slate-300 text-transparent hover:border-green-500"}`}
    >
      ✓
    </button>
  );
}

function ArticleRow(props: {
  article: Article;
  /** The searched words, marked in the title, and where the search found the link. */
  words: SearchWord[];
  found: SearchMatch;
  /** In search results: fewer buttons, so the matches stand out. */
  compact: boolean;
  categoryLabel: string;
  /** Show the category tag: on lists that mix categories (All, search). */
  showCategory: boolean;
  onShowCategory: () => void;
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
  onEditTags: () => void;
  onTagClick: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onRemoveAiTag: (tag: string) => void;
  onSaveNote: (note: string) => void;
  aiNoteStartedAt: number | null;
  aiNoteError: string | null;
  onAiNote: () => void;
  onDelete: () => void;
  flash: boolean;
}) {
  const { article } = props;
  const rowRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (props.flash) rowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [props.flash]);
  const [editingNote, setEditingNote] = useState(false);
  const { over, handlers } = usePointerDrag(
    {
      onDragStart: editingNote ? undefined : props.onDragStart,
      onDragEnd: props.onDragEnd,
      canDrop: props.canReorder && !props.dragging,
      onDrop: props.onDropOnto,
    },
    rowRef,
  );
  const hasNotes = Boolean(article.notes?.trim()) || hasWriting(article.pages);
  return (
    <li
      ref={rowRef}
      {...handlers}
      className={`flex cursor-grab items-start gap-3 rounded-xl border bg-white p-3 shadow-sm transition ${props.dragging ? "opacity-40" : ""} ${over ? "border-blue-500 ring-2 ring-blue-500" : props.flash ? "border-green-500 ring-4 ring-green-400" : "border-slate-200"}`}
    >
      <ReadCheck read={Boolean(article.read_at)} onClick={props.onToggleRead} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link href={`/read/${article.id}`} className={`line-clamp-2 font-medium hover:underline ${article.read_at ? "text-slate-500" : ""}`}>
          {hasNotes && (
            <span className="mr-1.5 inline-block rounded-md bg-amber-400 px-1.5 py-0.5 align-[1px] text-[11px] font-bold text-amber-950 no-underline">
              <Ico icon={NotebookText} tone="amber" size={12} className="mr-0.5 inline align-[-2px]" />
              Notes
            </span>
          )}
          <Highlight text={article.title || article.url} words={props.words} />
        </Link>
        <FoundIn match={props.found} words={props.words} />
        {props.showCategory && <CategoryTag path={props.categoryLabel} onClick={props.onShowCategory} />}
        <p className="text-xs text-slate-500">
          {[article.site, article.author].filter(Boolean).join(" · ")}
          {" · "}Added {formatDate(article.created_at)}
          {article.read_at && <span className="text-green-700"> · Read {formatDate(article.read_at)}</span>}
        </p>
        {/* The found line already shows why it matched; the summary would repeat it. */}
        {!(props.compact && props.found) && (
          <div id={`ai-note-${article.id}`} className="rounded-md">
            <ArticleNote
              note={article.note}
              editing={editingNote}
              setEditing={setEditingNote}
              onSave={props.onSaveNote}
            />
          </div>
        )}
        {props.aiNoteError && !article.note && (
          <p className="flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700 ring-1 ring-red-200">
            <Ico icon={TriangleAlert} tone="red" size={14} />
            {props.aiNoteError}
          </p>
        )}
        <TagPills tags={article.tags} aiTags={article.ai_tags} onTagClick={props.onTagClick} onRemove={props.onRemoveTag} onRemoveAi={props.onRemoveAiTag} />
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <Link
            href={`/read/${article.id}?notes=1`}
            className={
              hasNotes
                ? "inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-200"
                : "inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            }
          >
            <Ico icon={hasNotes ? NotebookText : Pencil} tone={hasNotes ? "amber" : "amber"} size={14} />
            {hasNotes ? "Open notes" : "Take notes"}
          </Link>
          {!props.compact && (
            <a
              href={article.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
            >
              <Ico icon={ExternalLink} tone="blue" size={14} />
              Original
            </a>
          )}
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
          {!props.compact && !article.note && !editingNote && <SmallButton onClick={() => setEditingNote(true)} icon={FilePen} tone="blue">Add summary</SmallButton>}
          {!props.compact && article.note && !editingNote && (
            <SmallButton
              onClick={async () => {
                const ok = await askConfirm({
                  title: "Clear this summary?",
                  quote: article.note,
                  message: "Only the summary goes away. Your notes and the link stay.",
                  confirmLabel: "Yes, clear summary",
                  cancelLabel: "Keep it",
                });
                if (ok) props.onSaveNote("");
              }}
              icon={Brush}
              tone="amber"
            >
              Clear summary
            </SmallButton>
          )}
          {!props.compact && !article.note && !editingNote && props.aiNoteStartedAt === null && (
            <SmallButton onClick={props.onAiNote} title="Let AI read the page and write the summary" icon={Sparkles} tone="violet">
              AI summary
            </SmallButton>
          )}
          {!article.note && props.aiNoteStartedAt !== null && <AiNoteWorking startedAt={props.aiNoteStartedAt} jobKey={aiNoteKey(article.id)} />}
          {/* The less-used actions, Delete last, so the card stays tidy. */}
          <span className="ml-auto pl-2">
            <MoreMenu
              items={[
                ...(props.compact ? [{ label: "Open the original", icon: ExternalLink, onClick: () => window.open(article.url, "_blank", "noopener") }] : []),
                { label: "Edit title", icon: PencilLine, onClick: props.onRename },
                { label: "Tags", icon: Tag, tone: "amber", onClick: props.onEditTags },
                { label: "Delete", icon: Trash2, danger: true, onClick: props.onDelete },
              ]}
              move={{ value: article.category_id, options: props.categoryOptions, onMove: props.onMove }}
            />
          </span>
        </div>
      </div>
    </li>
  );
}

export type Toast = { text: string; isError?: boolean; warn?: boolean; href?: string };

// The message at the bottom of the screen. Duplicates show in amber, longer, with a close button.
export function ToastBox({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const color = toast.isError ? "bg-red-600 text-white" : toast.warn ? "bg-amber-400 text-amber-950" : "bg-slate-900 text-white";
  return (
    <div
      role="status"
      className={`fixed bottom-4 left-1/2 z-30 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-lg px-4 py-2 text-sm shadow-lg ${color}`}
    >
      <span>
        {toast.warn && <Ico icon={TriangleAlert} tone="amber" size={15} className="mr-1 inline align-[-2px]" />}
        {toast.text}
      </span>
      {toast.href && (
        <Link href={toast.href} className="shrink-0 font-semibold underline">
          Open it
        </Link>
      )}
      {toast.warn && (
        <button onClick={onClose} aria-label="Close" className="shrink-0 font-bold opacity-70 hover:opacity-100">
          ✕
        </button>
      )}
    </div>
  );
}

// Shown in place of the AI summary button while the AI writes the note.
export function AiNoteWorking({ startedAt, jobKey }: { startedAt: number; jobKey: string }) {
  const seconds = useSecondsSince(startedAt);
  const job = useAiJobs().running.find((j) => j.key === jobKey);
  return (
    <span className="flex items-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 py-0.5 pl-2 pr-0.5 text-xs text-violet-800">
      <span className="inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-violet-300 border-t-violet-700" />
      {stillWorkingNote(seconds, job?.note) ?? "Writing summary…"} {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
      <AiModelTag model={job?.model} className="hidden sm:inline-block" />
      <StopAiButton jobKey={jobKey} />
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
                  title: "Clear this summary?",
                  quote: current,
                  message: "Only the summary goes away. Your notes and the article stay.",
                  confirmLabel: "Yes, clear summary",
                  cancelLabel: "Keep it",
                });
                if (!ok) return;
                props.onSave("");
                props.setEditing(false);
              }}
              icon={Brush}
              tone="amber"
            >
              Clear summary
            </SmallButton>
          )}
          <SmallButton onClick={() => props.setEditing(false)}>Cancel</SmallButton>
          <button
            onClick={save}
            className="rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-700"
          >
            Save summary
          </button>
        </div>
      </div>
    );
  }

  if (!current) return null;
  return (
    <button
      onClick={() => props.setEditing(true)}
      title="Tap to edit the summary"
      className="rounded-md bg-amber-50 px-2 py-1 text-left text-sm whitespace-pre-wrap text-slate-700 hover:bg-amber-100"
    >
      {current}
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
    <form data-tour="add-article" onSubmit={submit} className="mb-4 flex flex-col gap-2 sm:flex-row">
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
        <option value="">Sort by author</option>
        {props.categoryOptions.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
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
  icon?: LucideIcon;
  tone?: Tone;
}) {
  const { ref, over, handlers } = usePointerDrag<HTMLButtonElement>({
    onDragStart: props.onDragStart,
    onDragEnd: props.onDragEnd,
    canDrop: Boolean(props.onDropArticle),
    onDrop: props.onDropArticle,
  });
  const Icon = props.icon;
  return (
    <button
      ref={ref}
      {...handlers}
      onClick={props.onClick}
      onContextMenu={props.onContextMenu}
      className={`flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-sm ${props.active ? "bg-slate-900 text-white" : "hover:bg-slate-100"} ${over ? "ring-2 ring-blue-500" : ""}`}
      style={{ paddingLeft: 8 + (props.indent ?? 0) * 22 }}
    >
      {Icon && <Ico icon={Icon} tone={props.tone ?? "slate"} />}
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
  icon: Icon,
  tone = "slate",
  pill,
}: {
  children?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
  icon?: LucideIcon;
  tone?: Tone;
  // A light blue pill, used for Preview buttons.
  pill?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`inline-flex items-center gap-1 border px-2 py-1 text-xs disabled:opacity-30 ${danger ? "rounded-md border-red-200 text-red-600 hover:bg-red-50" : pill ? "rounded-full border-blue-200 bg-blue-50 text-slate-900 hover:bg-blue-100" : "rounded-md border-slate-300 text-slate-700 hover:bg-slate-100"}`}
    >
      {Icon && <Ico icon={Icon} tone={danger ? "red" : tone} size={14} />}
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
