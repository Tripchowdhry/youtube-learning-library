"use client";

import AiUsageLink from "@/components/AiUsageLink";
import SearchBox from "@/components/SearchBox";
import FoundElsewhere, { useSearchFromLink } from "@/components/FoundElsewhere";
import TagPills from "@/components/TagPills";
import { allTags } from "@/lib/ai-tags";
import { askTags } from "@/lib/tags";
import { FoundIn, Highlight, SearchBar, type SearchScope } from "@/components/SearchHighlight";
import { TAGS_LABEL, bestFirst, hashTag, matches, tagTest, notesText, prepare, queryWords, whereFound, type SearchMatch, type SearchWord } from "@/lib/search";
import { friendlyError } from "@/lib/errors";
import BrandMark from "@/components/BrandMark";
import { askConfirm, askText } from "@/components/ConfirmDialog";
import CategoryTag from "@/components/CategoryTag";
import CategoryTree from "@/components/CategoryTree";
import ContextMenu, { type MenuState } from "@/components/ContextMenu";
import {
  FolderSortSelect,
  SidebarHeading,
  compareFolders,
  sortHint,
  useFolderSort,
} from "@/components/FolderSort";
import {
  NavItem,
  SectionSwitch,
  SetupNotice,
  SmallButton,
  formatDate,
} from "@/components/ReadingLibrary";
import { isWithin, treeOptions, treePath } from "@/lib/category-tree";
import { usePointerDrag } from "@/lib/pointer-drag";
import { isMissingTable, type Report } from "@/lib/report";
import { createClient } from "@/lib/supabase/client";
import { ReportIcon } from "@/components/ReportWriterLink";
import {
  ArrowUp,
  Files,
  Inbox,
  Pencil,
  Tag,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Tour, TourButton, useSectionTour } from "@/components/Tour";
import { useCallback, useEffect, useMemo, useState } from "react";

type Row = Pick<Report, "id" | "title" | "updated_at" | "tags" | "ai_tags"> & {
  // The report's text, for search.
  body?: string;
  category_id?: string | null;
  report_sources: { count: number }[];
};
type ReportCategory = {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  position: number;
  created_at: string;
};
type View =
  | { kind: "all" }
  | { kind: "uncategorized" }
  | { kind: "category"; id: string };

const NAME_MAX = 100;

// Report Writer's home: your reports in categories, like the other sections, and a button to start a new one.
export default function ReportsList({ userEmail }: { userEmail: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [reports, setReports] = useState<Row[] | null>(null);
  const [categories, setCategories] = useState<ReportCategory[]>([]);
  const [needsSetup, setNeedsSetup] = useState(false);
  // Reports work without categories; they just need supabase/report-categories.sql to be run first.
  const [categoriesReady, setCategoriesReady] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  useSearchFromLink(setQuery);
  // Clicking a tag shows every report with exactly that tag.
  const [tag, setTag] = useState<string | null>(null);
  // Inside a category, search can look only there or in the whole tab.
  const [scope, setScope] = useState<SearchScope>("everywhere");
  const [view, setView] = useState<View>({ kind: "all" });
  const [showCategories, setShowCategories] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingCategoryId, setDraggingCategoryId] = useState<string | null>(
    null,
  );
  const [menu, setMenu] = useState<MenuState | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const tour = useSectionTour("reports", reports !== null && !needsSetup);

  const load = useCallback(async () => {
    const [r, c] = await Promise.all([
      supabase
        .from("reports")
        // Every column, so tags (supabase/ai-tags.sql) and categories show once their SQL is run.
        .select("*, report_sources(count)")
        .order("updated_at", { ascending: false }),
      supabase
        .from("report_categories")
        .select("*")
        .order("position")
        .order("name"),
    ]);
    if (c.error || r.error) {
      // Before report-categories.sql is run, show the reports without categories.
      setCategoriesReady(false);
      setCategories([]);
      if (!r.error) return setReports(r.data as Row[]);
      if (isMissingTable(r.error.message)) setNeedsSetup(true);
      else setError(friendlyError(r.error.message));
      setReports([]);
      return;
    }
    setCategoriesReady(true);
    setCategories(c.data as ReportCategory[]);
    setReports(r.data as Row[]);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  // ---------- Categories ----------

  const [folderSort, setFolderSort] = useFolderSort();
  const childCategories = useCallback(
    (parentId: string | null) =>
      categories
        .filter((c) => c.parent_id === parentId)
        .sort(compareFolders(folderSort)),
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
  const categoryPath = useCallback(
    (id: string | null | undefined) => treePath(categories, id ?? null),
    [categories],
  );
  const categoryOptions = useMemo(
    () => treeOptions(childCategories),
    [childCategories],
  );
  const currentCategory =
    view.kind === "category"
      ? (categories.find((c) => c.id === view.id) ?? null)
      : null;
  const inCategory = useCallback(
    (r: Row, id: string) => isWithin(categories, r.category_id ?? null, id),
    [categories],
  );
  const countIn = (id: string) =>
    (reports ?? []).filter((r) => inCategory(r, id)).length;

  // Searching covers typed words and a tag clicked on a report.
  const searching = query.trim().length > 0 || tag !== null;
  // "#react" in the search box filters by tag instead of searching words.
  const typedTag = useMemo(() => hashTag(query), [query]);
  const words = useMemo(() => (typedTag === null ? queryWords(query) : []), [query, typedTag]);
  // Everything search looks at for each report, prepared once rather than on every key press.
  const searchIndex = useMemo(
    () =>
      new Map(
        (reports ?? []).map((r) => [
          r.id,
          prepare([
            { label: "Title", text: r.title },
            { label: "the report", text: notesText(r.body) },
            { label: "the category", text: categoryPath(r.category_id) },
            { label: TAGS_LABEL, text: allTags(r).join(", ") },
          ]),
        ]),
      ),
    [reports, categoryPath],
  );
  const shown = useMemo(() => {
    if (!reports) return null;
    const tagOk = tagTest(tag, typedTag);
    const found = reports.filter((r) => {
      if (tagOk && !tagOk(allTags(r))) return false;
      if (words.length && !matches(searchIndex.get(r.id) ?? [], words)) return false;
      // A search looks in the whole tab unless you chose only the category you're in.
      if (searching && scope === "everywhere") return true;
      if (view.kind === "uncategorized") return !r.category_id;
      if (view.kind === "category") return inCategory(r, view.id);
      return true;
    });
    // Best match first; otherwise the most recently edited first, as loaded.
    return words.length ? found.sort(bestFirst(words, (r) => searchIndex.get(r.id) ?? [], () => 0)) : found;
  }, [reports, words, tag, typedTag, searching, scope, searchIndex, view, inCategory]);

  function openView(next: View) {
    setView(next);
    setQuery("");
    setTag(null);
    setShowCategories(false);
  }

  async function createCategory(parentId: string | null) {
    const name = (
      await askText({
        title: parentId
          ? `New subcategory inside "${categoryPath(parentId)}"`
          : "New category",
        placeholder: "Name",
        confirmLabel: "Create",
      })
    )
      ?.trim()
      .slice(0, NAME_MAX);
    if (!name) return;
    const siblings = categories.filter((c) => c.parent_id === parentId);
    const position = siblings.length
      ? Math.max(...siblings.map((c) => c.position)) + 1
      : 0;
    const { data, error } = await supabase
      .from("report_categories")
      .insert({ name, parent_id: parentId, position })
      .select()
      .single();
    if (error) return setError(friendlyError(error.message));
    setCategories((prev) => [...prev, data as ReportCategory]);
    openView({ kind: "category", id: (data as ReportCategory).id });
  }

  async function renameCategory(category: ReportCategory) {
    const name = (
      await askText({
        title: "Rename",
        value: category.name,
        confirmLabel: "Rename",
      })
    )?.slice(0, NAME_MAX);
    if (!name || name === category.name) return;
    setCategories((prev) =>
      prev.map((c) => (c.id === category.id ? { ...c, name } : c)),
    );
    const { error } = await supabase
      .from("report_categories")
      .update({ name })
      .eq("id", category.id);
    if (error) {
      setError(friendlyError(error.message));
      load();
    }
  }

  async function deleteCategory(category: ReportCategory) {
    const ok = await askConfirm({
      title: `Delete "${category.name}" and any categories inside it?`,
      message: "The reports inside will move to Uncategorized, not be deleted.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    const { error } = await supabase
      .from("report_categories")
      .delete()
      .eq("id", category.id);
    if (error) return setError(friendlyError(error.message));
    setView({ kind: "all" });
    load();
  }

  // Drop a category onto another and it goes next to it, at that one's level.
  async function moveCategoryTo(draggedId: string, targetId: string) {
    const dragged = categories.find((c) => c.id === draggedId);
    const target = categories.find((c) => c.id === targetId);
    if (!dragged || !target || isWithin(categories, target.id, dragged.id))
      return;
    const parent_id = target.parent_id;
    const sameLevel = dragged.parent_id === parent_id;
    const all = childCategories(parent_id);
    const siblings = all.filter((c) => c.id !== dragged.id);
    const index = siblings.findIndex((c) => c.id === target.id);
    siblings.splice(
      sameLevel && all.indexOf(dragged) > index ? index : index + 1,
      0,
      dragged,
    );
    const changed = siblings
      .map((c, position) => ({ id: c.id, position }))
      .filter(
        (c, i) =>
          siblings[i].position !== c.position ||
          (!sameLevel && c.id === dragged.id),
      );
    setCategories((prev) =>
      prev.map((c) => {
        const m = changed.find((x) => x.id === c.id);
        if (!m) return c;
        return c.id === dragged.id
          ? { ...c, position: m.position, parent_id }
          : { ...c, position: m.position };
      }),
    );
    const results = await Promise.all(
      changed.map((c) =>
        supabase
          .from("report_categories")
          .update(
            c.id === dragged.id && !sameLevel
              ? { position: c.position, parent_id }
              : { position: c.position },
          )
          .eq("id", c.id),
      ),
    );
    if (results.some((r) => r.error)) {
      setError(friendlyError(results.find((r) => r.error)!.error!.message));
      load();
    }
  }

  async function moveCategoryUp(category: ReportCategory) {
    const parent = categories.find((c) => c.id === category.parent_id);
    const parent_id = parent?.parent_id ?? null;
    const position =
      Math.max(-1, ...childCategories(parent_id).map((c) => c.position)) + 1;
    setCategories((prev) =>
      prev.map((c) =>
        c.id === category.id ? { ...c, parent_id, position } : c,
      ),
    );
    const { error } = await supabase
      .from("report_categories")
      .update({ parent_id, position })
      .eq("id", category.id);
    if (error) {
      setError(friendlyError(error.message));
      load();
    }
  }

  function openCategoryMenu(category: ReportCategory, e: React.MouseEvent) {
    e.preventDefault();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: "Rename",
          icon: Pencil,
          tone: "amber" as const,
          onClick: () => renameCategory(category),
        },
        {
          label: "New subcategory",
          icon: Tag,
          tone: "amber" as const,
          onClick: () => createCategory(category.id),
        },
        ...(category.parent_id
          ? [
              {
                label: "Move up a level",
                icon: ArrowUp,
                tone: "blue" as const,
                onClick: () => moveCategoryUp(category),
              },
            ]
          : []),
        {
          label: "Delete",
          icon: Trash2,
          tone: "red" as const,
          onClick: () => deleteCategory(category),
          danger: true,
        },
      ],
    });
  }

  // A report dropped on a category moves into it; a category dropped on another takes its place.
  const dropOnCategory = (category: ReportCategory) => {
    if (draggingId) return () => moveReport(draggingId, category.id);
    const dragged = categories.find((c) => c.id === draggingCategoryId);
    if (dragged && !isWithin(categories, category.id, dragged.id)) {
      return () => {
        moveCategoryTo(dragged.id, category.id);
        if (folderSort !== "custom") setFolderSort("custom");
      };
    }
    return undefined;
  };

  // ---------- Reports ----------

  async function create() {
    setCreating(true);
    const row: { title: string; category_id?: string } = {
      title: "Untitled report",
    };
    if (categoriesReady && view.kind === "category") row.category_id = view.id;
    const { data, error } = await supabase
      .from("reports")
      .insert(row)
      .select("id")
      .single();
    if (error) {
      setCreating(false);
      if (isMissingTable(error.message)) setNeedsSetup(true);
      else setError(friendlyError(error.message));
      return;
    }
    router.push(`/report/${data.id}`);
  }

  // Your own tags (up to 2) and the AI's. Removing an AI tag keeps it removed.
  async function updateTags(id: string, changes: Pick<Row, "tags"> | Pick<Row, "ai_tags">) {
    setReports((rows) => rows?.map((r) => (r.id === id ? { ...r, ...changes } : r)) ?? rows);
    const { error } = await supabase.from("reports").update(changes).eq("id", id);
    if (error) {
      setError(friendlyError(error.message));
      load();
    }
  }

  async function editTags(report: Row) {
    const tags = await askTags(report.tags ?? [], (text, isError) => isError && setError(text));
    if (tags) updateTags(report.id, { tags });
  }

  async function moveReport(id: string, categoryId: string | null) {
    const report = reports?.find((r) => r.id === id);
    if (!report || (report.category_id ?? null) === categoryId) return;
    setReports(
      (rows) =>
        rows?.map((r) =>
          r.id === id ? { ...r, category_id: categoryId } : r,
        ) ?? rows,
    );
    const { error } = await supabase
      .from("reports")
      .update({ category_id: categoryId })
      .eq("id", id);
    if (error) {
      setError(friendlyError(error.message));
      load();
    }
  }

  async function remove(report: Row) {
    const ok = await askConfirm({
      title: "Delete this report?",
      message:
        "Only the report is deleted. Your videos, readings, tutorials and their notes stay as they are.",
      quote: report.title,
      confirmLabel: "Delete report",
      danger: true,
    });
    if (!ok) return;
    const { error } = await supabase
      .from("reports")
      .delete()
      .eq("id", report.id);
    if (error) setError(friendlyError(error.message));
    else setReports((rows) => rows?.filter((r) => r.id !== report.id) ?? rows);
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const title = searching
    ? query.trim()
      ? `Search results for "${query.trim()}"`
      : `Tagged #${tag}`
    : view.kind === "all"
      ? "All reports"
      : view.kind === "uncategorized"
        ? "Uncategorized"
        : categoryPath(view.id);

  return (
    <div className="flex min-h-screen flex-col">
      {/* The same header as Videos, Reading, Tutorials, ScrapBook and Vault, with no tab highlighted. */}
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-3 sm:gap-3">
        {categoriesReady && (
          <button
            data-tour="report-categories"
            className="rounded-md border border-slate-300 px-2 py-1 text-sm md:hidden"
            onClick={() => setShowCategories((s) => !s)}
          >
            {showCategories ? "Close" : "Categories"}
          </button>
        )}
        <BrandMark />
        <SectionSwitch active="reports" />
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Search titles and report text…"
          className="ml-auto w-auto sm:w-full sm:max-w-xs lg:max-w-xl"
          collapse
          recentKey="reports"
          tone="violet"
        />
        <AiUsageLink />
        <div className="hidden items-center gap-2 text-sm text-slate-500 sm:flex">
          <span className="hidden max-w-40 truncate lg:inline">
            {userEmail}
          </span>
          <button
            onClick={signOut}
            className="rounded-md px-2 py-1 whitespace-nowrap hover:bg-slate-100"
          >
            Sign out
          </button>
        </div>
      </header>
      <Tour open={tour.open} steps={tour.steps} onClose={tour.close} />

      <div className="flex flex-1">
        <aside
          className={`${showCategories ? "fixed inset-x-0 top-[57px] bottom-0 z-10 block" : "hidden"} w-full overflow-y-auto border-r border-slate-200 bg-white p-3 md:sticky md:top-[57px] md:block md:h-[calc(100vh-57px)] md:w-72`}
          onContextMenu={(e) => {
            if (e.defaultPrevented || !categoriesReady) return;
            e.preventDefault();
            setMenu({
              x: e.clientX,
              y: e.clientY,
              items: [
                {
                  label: "New category",
                  icon: Tag,
                  tone: "amber" as const,
                  onClick: () => createCategory(null),
                },
              ],
            });
          }}
        >
          <AiUsageLink sidebar withReport={false} />
          <NavItem
            icon={Files}
            tone="navy"
            label="All reports"
            count={reports?.length ?? 0}
            active={view.kind === "all" && !searching}
            onClick={() => openView({ kind: "all" })}
          />
          {categoriesReady && (
            <>
              <NavItem
                icon={Inbox}
                tone="blue"
                label="Uncategorized"
                count={(reports ?? []).filter((r) => !r.category_id).length}
                active={view.kind === "uncategorized" && !searching}
                onClick={() => openView({ kind: "uncategorized" })}
                onDropArticle={
                  draggingId ? () => moveReport(draggingId, null) : undefined
                }
              />
              <div data-tour="report-categories">
                <SidebarHeading label="Categories">
                  <FolderSortSelect
                    sort={folderSort}
                    onChange={setFolderSort}
                  />
                  <button
                    onClick={() => createCategory(null)}
                    className="rounded px-1.5 text-base text-slate-700 hover:bg-slate-100"
                    title="New category"
                  >
                    +
                  </button>
                </SidebarHeading>
                {topCategories.length === 0 && (
                  <p className="px-2 text-sm text-slate-500">
                    No categories yet. Click + to make one, like &quot;Machine
                    learning&quot;.
                  </p>
                )}
                <CategoryTree
                  parentId={null}
                  childrenOf={childCategories}
                  collapsed={collapsed}
                  onToggle={toggleCategory}
                  activeId={
                    !searching && view.kind === "category" ? view.id : null
                  }
                  count={countIn}
                  onOpen={(id) => openView({ kind: "category", id })}
                  dropOn={dropOnCategory}
                  onDragStart={setDraggingCategoryId}
                  onDragEnd={() => setDraggingCategoryId(null)}
                  onMenu={openCategoryMenu}
                />
                {topCategories.length > 1 && (
                  <p className="mt-3 px-2 text-xs text-slate-400">
                    {sortHint(folderSort, "categories", false)}
                  </p>
                )}
              </div>
            </>
          )}
          <button
            onClick={signOut}
            className="mt-6 px-2 text-sm text-slate-500 underline sm:hidden"
          >
            Sign out
          </button>
        </aside>

        <main className="min-w-0 flex-1 p-4 md:p-6">
          {needsSetup ? (
            <SetupNotice file="reports.sql" />
          ) : (
            <>
              {!categoriesReady && reports !== null && (
                <div className="mb-4">
                  <SetupNotice file="report-categories.sql" />
                </div>
              )}
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h1 className="mr-auto flex items-center gap-2 text-2xl font-bold text-slate-900">
                  {title}
                </h1>
                <TourButton onClick={tour.start} />
                {currentCategory && !searching && (
                  <>
                    <SmallButton
                      onClick={() => createCategory(currentCategory.id)}
                    >
                      + Subcategory
                    </SmallButton>
                    <SmallButton
                      onClick={() => renameCategory(currentCategory)}
                    >
                      Rename
                    </SmallButton>
                    <SmallButton
                      onClick={() => deleteCategory(currentCategory)}
                      danger
                    >
                      Delete
                    </SmallButton>
                  </>
                )}
              </div>
              {searching && shown && (
                <SearchBar
                  count={shown.length}
                  ranked={words.length > 0}
                  tag={tag}
                  onClearTag={() => setTag(null)}
                  categoryName={view.kind === "all" ? null : view.kind === "uncategorized" ? "Uncategorized" : categoryPath(view.id)}
                  scope={scope}
                  onScope={setScope}
                />
              )}
              <p
                className={`mb-4 text-sm text-slate-600 ${view.kind === "all" && !searching ? "" : "hidden"}`}
              >
                Turn notes from your videos, readings, tutorials and ScrapBook
                into one report. Your notes stay as they are.
              </p>
              <button
                data-tour="new-report"
                onClick={create}
                disabled={creating}
                className="mb-4 rounded-md bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {creating
                  ? "Starting…"
                  : currentCategory && !searching
                    ? `+ New report in ${currentCategory.name}`
                    : "+ New report"}
              </button>

              {error && (
                <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}

              {shown === null ? (
                <p className="text-sm text-slate-500">Loading…</p>
              ) : searching && !shown.length ? (
                <div className="text-sm text-slate-500">
                  <p>No reports match &ldquo;{query.trim() || `#${tag}`}&rdquo;.</p>
                  <div className="[&>p]:justify-start">
                    <FoundElsewhere query={query} here="reports" />
                  </div>
                </div>
              ) : shown.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
                  <ReportIcon size={48} className="mx-auto mb-2" />
                  {reports?.length ? (
                    "Nothing here yet. Start a new report, or drag one in from another category."
                  ) : (
                    <>
                      No reports yet. Click <b>New report</b> to make your first
                      one.
                    </>
                  )}
                </div>
              ) : (
                <>
                  {categoriesReady &&
                    categories.length > 0 &&
                    shown.length > 1 && (
                      <p className="mb-3 text-xs text-slate-500">
                        Tip: drag a report onto a category on the left to move
                        it.
                      </p>
                    )}
                  <ul className="flex flex-col gap-2">
                    {shown.map((r) => (
                      <ReportRow
                        key={r.id}
                        report={r}
                        words={words}
                        found={searching ? whereFound(searchIndex.get(r.id) ?? [], words) : null}
                        categoriesReady={categoriesReady}
                        categoryLabel={
                          categoryPath(r.category_id) || "Uncategorized"
                        }
                        showCategory={
                          categoriesReady &&
                          (searching || view.kind !== "category")
                        }
                        onShowCategory={() =>
                          openView(
                            r.category_id
                              ? { kind: "category", id: r.category_id }
                              : { kind: "uncategorized" },
                          )
                        }
                        categoryOptions={categoryOptions}
                        onMove={(categoryId) => moveReport(r.id, categoryId)}
                        dragging={draggingId === r.id}
                        onDragStart={() => setDraggingId(r.id)}
                        onDragEnd={() => setDraggingId(null)}
                        onDelete={() => remove(r)}
                        onEditTags={() => editTags(r)}
                        onTagClick={(t) => {
                          setTag(t);
                          setQuery("");
                        }}
                        onRemoveTag={(t) => updateTags(r.id, { tags: (r.tags ?? []).filter((x) => x !== t) })}
                        onRemoveAiTag={(t) => updateTags(r.id, { ai_tags: (r.ai_tags ?? []).filter((x) => x !== t) })}
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
    </div>
  );
}

function ReportRow(props: {
  report: Row;
  /** The searched words, marked in the title, and where the search found the report. */
  words: SearchWord[];
  found: SearchMatch;
  categoriesReady: boolean;
  categoryLabel: string;
  showCategory: boolean;
  onShowCategory: () => void;
  categoryOptions: { id: string; label: string }[];
  onMove: (categoryId: string | null) => void;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDelete: () => void;
  onEditTags: () => void;
  onTagClick: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onRemoveAiTag: (tag: string) => void;
}) {
  const r = props.report;
  // Tags show once supabase/ai-tags.sql has been run.
  const tagsReady = "tags" in r;
  const count = r.report_sources?.[0]?.count ?? 0;
  const { ref, handlers } = usePointerDrag<HTMLLIElement>({
    onDragStart: props.categoriesReady ? props.onDragStart : undefined,
    onDragEnd: props.onDragEnd,
  });
  return (
    <li
      ref={ref}
      {...handlers}
      className={`flex items-start gap-3 rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200 ${props.dragging ? "opacity-50" : ""}`}
    >
      <ReportIcon size={24} className="mt-0.5" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link href={`/report/${r.id}`} className="min-w-0">
          <span className="block truncate font-medium text-slate-900 hover:underline">
            <Highlight text={r.title} words={props.words} />
          </span>
          <span className="text-xs text-slate-500">
            {count} source{count === 1 ? "" : "s"} · edited{" "}
            {formatDate(r.updated_at)}
          </span>
        </Link>
        <FoundIn match={props.found} words={props.words} />
        {props.showCategory && (
          <CategoryTag
            path={props.categoryLabel}
            onClick={props.onShowCategory}
          />
        )}
        <TagPills tags={r.tags} aiTags={r.ai_tags} onTagClick={props.onTagClick} onRemove={props.onRemoveTag} onRemoveAi={props.onRemoveAiTag} />
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {props.categoriesReady && (
            <select
              value={r.category_id ?? ""}
              onChange={(e) => props.onMove(e.target.value || null)}
              onPointerDown={(e) => e.stopPropagation()}
              className="max-w-48 min-w-0 self-start rounded-md border border-slate-300 bg-white px-1 py-1 text-xs"
              aria-label="Category"
              title="Move to another category"
            >
              <option value="">Uncategorized</option>
              {props.categoryOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          )}
          {tagsReady && (
            <SmallButton onClick={props.onEditTags} title="Add your own tags" icon={Tag} tone="amber">
              Tags
            </SmallButton>
          )}
          <SmallButton
            onClick={props.onDelete}
            danger
            title="Delete report"
            icon={Trash2}
          >
            Delete
          </SmallButton>
        </div>
      </div>
    </li>
  );
}
