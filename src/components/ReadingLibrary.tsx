"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Article, ArticleCategory } from "@/lib/types";

type View = { kind: "all" } | { kind: "uncategorized" } | { kind: "category"; id: string };
type Period = "any" | "week" | "month" | "year";
type ReadFilter = "all" | "unread" | "read";

const PERIODS: { value: Period; label: string; days: number }[] = [
  { value: "any", label: "Any time", days: 0 },
  { value: "week", label: "Past week", days: 7 },
  { value: "month", label: "Past month", days: 31 },
  { value: "year", label: "Past year", days: 366 },
];

// Longest personal note on an article: about the length of an X post.
export const NOTE_MAX = 280;

const byPosition = (a: ArticleCategory, b: ArticleCategory) => a.position - b.position || a.name.localeCompare(b.name);

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export default function ReadingLibrary({ userEmail }: { userEmail: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [categories, setCategories] = useState<ArticleCategory[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [view, setView] = useState<View>({ kind: "all" });
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState<Period>("any");
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [showCategories, setShowCategories] = useState(false);
  const [toast, setToast] = useState<{ text: string; isError?: boolean } | null>(null);

  const notify = useCallback((text: string, isError = false) => {
    setToast({ text, isError });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    const [c, a] = await Promise.all([
      supabase.from("article_categories").select("*").order("position").order("name"),
      supabase.from("articles").select("*").order("created_at", { ascending: false }),
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
  }, [supabase, notify]);

  useEffect(() => {
    load();
  }, [load]);

  // ---------- Category helpers ----------

  const topCategories = useMemo(() => categories.filter((c) => !c.parent_id).sort(byPosition), [categories]);
  const subcategories = useCallback(
    (parentId: string) => categories.filter((c) => c.parent_id === parentId).sort(byPosition),
    [categories],
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

  const currentCategory = view.kind === "category" ? categories.find((c) => c.id === view.id) ?? null : null;

  // A category shows its own articles plus those in its subcategories.
  const inCategory = useCallback(
    (article: Article, id: string) =>
      article.category_id === id || categories.some((c) => c.id === article.category_id && c.parent_id === id),
    [categories],
  );

  // ---------- Which articles to show ----------

  const searching = query.trim().length > 0;

  const visibleArticles = useMemo(() => {
    const q = query.trim().toLowerCase();
    const days = PERIODS.find((p) => p.value === period)!.days;
    const since = days ? Date.now() - days * 86_400_000 : 0;
    return articles.filter((a) => {
      if (since && new Date(a.created_at).getTime() < since) return false;
      if (readFilter === "read" && !a.read_at) return false;
      if (readFilter === "unread" && a.read_at) return false;
      if (q) return [a.title, a.site, a.author, a.url, a.note, categoryPath(a.category_id)].some((s) => s?.toLowerCase().includes(q));
      if (view.kind === "uncategorized") return !a.category_id;
      if (view.kind === "category") return inCategory(a, view.id);
      return true;
    });
  }, [articles, query, period, readFilter, view, categoryPath, inCategory]);

  const countIn = (id: string) => articles.filter((a) => inCategory(a, id)).length;

  // ---------- Article actions ----------

  async function addArticle(link: string, categoryId: string | null) {
    const res = await fetch(`/api/article-info?url=${encodeURIComponent(link)}`);
    const info = await res.json();
    if (!res.ok) {
      notify(info.error ?? "Couldn't read that link.", true);
      return false;
    }

    const existing = articles.find((a) => a.url === info.url);
    if (existing) {
      notify(`Already saved in ${existing.category_id ? categoryPath(existing.category_id) : "Uncategorized"}.`, true);
      return false;
    }

    let title: string | null = info.title;
    if (!title) {
      title = window.prompt("This site didn't share its title. Type one:", info.site ?? "")?.trim() || null;
      if (!title) return false;
    }

    const { data, error } = await supabase
      .from("articles")
      .insert({ url: info.url, title, site: info.site, author: info.author, category_id: categoryId })
      .select()
      .single();
    if (error) {
      notify(error.message, true);
      return false;
    }
    setArticles((prev) => [data as Article, ...prev]);
    notify(`Saved "${title}"`);
    return true;
  }

  async function updateArticle(id: string, changes: Partial<Article>) {
    setArticles((prev) => prev.map((a) => (a.id === id ? { ...a, ...changes } : a)));
    const { error } = await supabase.from("articles").update(changes).eq("id", id);
    if (error) {
      notify(error.message, true);
      load();
    }
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
    if (!window.confirm(`Delete "${article.title}" from your reading list?`)) return;
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
      .insert({ name: name.slice(0, 100), parent_id: parentId, position })
      .select()
      .single();
    if (error) return notify(error.message, true);
    setCategories((prev) => [...prev, data as ArticleCategory]);
    openView({ kind: "category", id: (data as ArticleCategory).id });
  }

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
      ? "All reading"
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
        <SectionSwitch active="reading" />
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
          <NavItem label="📄 All reading" count={articles.length} active={view.kind === "all" && !searching} onClick={() => openView({ kind: "all" })} />
          <NavItem
            label="📥 Uncategorized"
            count={articles.filter((a) => !a.category_id).length}
            active={view.kind === "uncategorized" && !searching}
            onClick={() => openView({ kind: "uncategorized" })}
          />

          <div className="mt-4 mb-1 flex items-center justify-between px-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Categories
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
              />
              {subcategories(cat.id).map((sub) => (
                <NavItem
                  key={sub.id}
                  label={sub.name}
                  count={countIn(sub.id)}
                  indent={1}
                  active={!searching && view.kind === "category" && view.id === sub.id}
                  onClick={() => openView({ kind: "category", id: sub.id })}
                />
              ))}
            </div>
          ))}

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
                <p className="text-slate-500">Loading your reading list…</p>
              ) : visibleArticles.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-500">
                  {searching || filtered
                    ? "Nothing matches. Try another search or a longer time range."
                    : articles.length
                      ? "Nothing here yet. Paste a link above, or move articles in from another category."
                      : "Your reading list is empty. Paste a link above, like an X post or a blog article."}
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {visibleArticles.map((article) => (
                    <ArticleRow
                      key={article.id}
                      article={article}
                      categoryLabel={categoryPath(article.category_id) || "Uncategorized"}
                      categoryOptions={categoryOptions}
                      onToggleRead={() => toggleRead(article)}
                      onMove={(categoryId) => updateArticle(article.id, { category_id: categoryId })}
                      onRename={() => renameArticle(article)}
                      onSaveNote={(note) => updateArticle(article.id, { note })}
                      onDelete={() => deleteArticle(article)}
                    />
                  ))}
                </ul>
              )}
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

// The Videos | Reading switch in the header of both sections.
export function SectionSwitch({ active }: { active: "videos" | "reading" }) {
  const tab = (on: boolean) =>
    `rounded-md px-2.5 py-1 text-sm font-medium ${on ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`;
  return (
    <nav className="flex shrink-0 rounded-lg bg-slate-100 p-0.5">
      <Link href="/" className={tab(active === "videos")} title="Videos">
        🎬<span className="hidden sm:inline"> Videos</span>
      </Link>
      <Link href="/reading" className={tab(active === "reading")} title="Reading">
        📄<span className="hidden sm:inline"> Reading</span>
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
  onRename: () => void;
  onSaveNote: (note: string) => void;
  onDelete: () => void;
}) {
  const { article } = props;
  const [editingNote, setEditingNote] = useState(false);
  return (
    <li className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
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
          {!article.note && !editingNote && <SmallButton onClick={() => setEditingNote(true)}>📝 Add note</SmallButton>}
          <SmallButton onClick={props.onRename}>Edit title</SmallButton>
          <SmallButton onClick={props.onDelete} danger title="Delete">
            🗑 Delete
          </SmallButton>
        </div>
      </div>
    </li>
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
        placeholder="Paste a link to an X post or article…"
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

function Pills<T extends string>(props: {
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

function NavItem(props: { label: string; count?: number; active: boolean; onClick: () => void; indent?: number }) {
  return (
    <button
      onClick={props.onClick}
      className={`flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-sm ${props.active ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`}
      style={{ paddingLeft: 8 + (props.indent ?? 0) * 22 }}
    >
      <span className="truncate">{props.label}</span>
      {props.count !== undefined && (
        <span className={`ml-auto text-xs ${props.active ? "text-slate-300" : "text-slate-400"}`}>{props.count}</span>
      )}
    </button>
  );
}

function SmallButton({
  children,
  onClick,
  danger,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`rounded-md border px-2 py-1 text-xs ${danger ? "border-red-200 text-red-600 hover:bg-red-50" : "border-slate-300 text-slate-700 hover:bg-slate-100"}`}
    >
      {children}
    </button>
  );
}

function SetupNotice() {
  return (
    <div className="max-w-xl rounded-xl border border-amber-300 bg-amber-50 p-5 text-slate-800">
      <h2 className="mb-2 text-lg font-semibold">One quick setup step</h2>
      <p>
        The Reading section needs two new tables. In Supabase, open <b>SQL Editor</b> → <b>New query</b>, paste the
        whole <code>supabase/articles.sql</code> file, and click <b>Run</b>. Then reload this page.
      </p>
    </div>
  );
}
