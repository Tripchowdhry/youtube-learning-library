"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ContextMenu, { type MenuState } from "@/components/ContextMenu";
import { FolderSortSelect, compareFolders, sortHint, useFolderSort } from "@/components/FolderSort";
import { NavItem, SectionSwitch, SetupNotice, SmallButton, formatDate } from "@/components/ReadingLibrary";
import { createClient } from "@/lib/supabase/client";
import type { VaultCategory, VaultEntry, VaultKey } from "@/lib/types";
import {
  PASSPHRASE_MIN,
  VAULT_ITERATIONS,
  decrypt,
  deriveKey,
  encrypt,
  isRightKey,
  makeCheckValue,
  newSalt,
  suggestPassphrase,
} from "@/lib/vault-crypto";

type View = { kind: "all" } | { kind: "uncategorized" } | { kind: "category"; id: string };
type Secret = "password" | "api_key";

// Longest value in any field (name is shorter, like a category name).
export const FIELD_MAX = 250;
const NAME_MAX = 100;
// The vault locks itself after this long without a click, key press or scroll.
const IDLE_LOCK_MS = 5 * 60_000;
// A shown password hides itself again after this long.
const REVEAL_MS = 30_000;

const SECRET_LABEL: Record<Secret, string> = { password: "Password", api_key: "API key" };

// Where a secret is used, so its scrambled text only opens for that entry and field.
const secretContext = (entryId: string, field: Secret) => `${entryId}:${field}`;

const without = (shown: Record<string, string>, ...ids: string[]) =>
  Object.fromEntries(Object.entries(shown).filter(([id]) => !ids.includes(id)));

export default function VaultLibrary({ userEmail }: { userEmail: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [categories, setCategories] = useState<VaultCategory[]>([]);
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [vaultKey, setVaultKey] = useState<VaultKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  // The unlocked key. It only lives here, in memory, and is dropped when the vault locks.
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<VaultEntry | "new" | null>(null);
  const [resetting, setResetting] = useState(false);
  const [view, setView] = useState<View>({ kind: "all" });
  const [query, setQuery] = useState("");
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
    const [c, e, k] = await Promise.all([
      supabase.from("vault_categories").select("*").order("position").order("name"),
      supabase.from("vault_entries").select("*").order("name"),
      supabase.from("vault_keys").select("*").maybeSingle(),
    ]);
    const error = c.error ?? e.error ?? k.error;
    if (error) {
      // Before supabase/vault.sql has been run, the tables don't exist yet.
      if (/does not exist|schema cache/i.test(error.message)) setNeedsSetup(true);
      else notify(error.message, true);
    } else {
      setCategories(c.data as VaultCategory[]);
      setEntries(e.data as VaultEntry[]);
      setVaultKey(k.data as VaultKey | null);
    }
    setLoading(false);
  }, [supabase, notify]);

  useEffect(() => {
    load();
  }, [load]);

  // ---------- Locking ----------

  const lock = useCallback(() => {
    setKey(null);
    setRevealed({});
    setEditing(null);
  }, []);

  // Lock after 5 idle minutes, and when the page is closed or left.
  useEffect(() => {
    if (!key) return;
    let timer = setTimeout(lock, IDLE_LOCK_MS);
    const restart = () => {
      clearTimeout(timer);
      timer = setTimeout(lock, IDLE_LOCK_MS);
    };
    const events = ["pointerdown", "keydown", "scroll", "touchstart", "mousemove"];
    events.forEach((ev) => window.addEventListener(ev, restart, { passive: true }));
    window.addEventListener("pagehide", lock);
    return () => {
      clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, restart));
      window.removeEventListener("pagehide", lock);
    };
  }, [key, lock]);

  // Gives back the key if the passphrase is right, or null if not.
  async function checkPassphrase(passphrase: string) {
    if (!vaultKey) return null;
    const candidate = await deriveKey(passphrase, vaultKey.salt, vaultKey.iterations);
    return (await isRightKey(candidate, vaultKey.check_value)) ? candidate : null;
  }

  // Makes the key for a new passphrase and what gets saved to check it later.
  async function newKeyFor(passphrase: string) {
    const salt = newSalt();
    const next = await deriveKey(passphrase, salt, VAULT_ITERATIONS);
    return { next, salt, check_value: await makeCheckValue(next) };
  }

  async function createVault(passphrase: string) {
    const { next, salt, check_value } = await newKeyFor(passphrase);
    const { data, error } = await supabase
      .from("vault_keys")
      .insert({ salt, iterations: VAULT_ITERATIONS, check_value })
      .select()
      .single();
    if (error) return notify(error.message, true);
    setVaultKey(data as VaultKey);
    setKey(next);
    notify("Your vault is ready");
  }

  async function resetVault(passphrase: string) {
    const { next, salt, check_value } = await newKeyFor(passphrase);
    const { error } = await supabase.rpc("reset_vault", {
      new_salt: salt,
      new_iterations: VAULT_ITERATIONS,
      new_check_value: check_value,
    });
    if (error) return notify(error.message, true);
    setResetting(false);
    setRevealed({});
    await load();
    setKey(next);
    notify("Vault reset. Add your new passwords and API keys.");
  }

  // ---------- Secrets ----------

  const openSecret = useCallback(
    async (entry: VaultEntry, field: Secret) => {
      const stored = entry[field];
      if (!key || !stored) return null;
      try {
        return await decrypt(key, stored, secretContext(entry.id, field));
      } catch {
        notify(`This ${SECRET_LABEL[field].toLowerCase()} can't be opened with the current passphrase.`, true);
        return null;
      }
    },
    [key, notify],
  );

  async function toggleReveal(entry: VaultEntry, field: Secret) {
    const id = secretContext(entry.id, field);
    if (revealed[id] !== undefined) {
      setRevealed((prev) => without(prev, id));
      return;
    }
    const text = await openSecret(entry, field);
    if (text === null) return;
    setRevealed((prev) => ({ ...prev, [id]: text }));
    setTimeout(() => setRevealed((prev) => without(prev, id)), REVEAL_MS);
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify(`${what} copied`);
    } catch {
      notify("Couldn't copy. Tap Show and copy it by hand.", true);
    }
  }

  async function copySecret(entry: VaultEntry, field: Secret) {
    const text = await openSecret(entry, field);
    if (text !== null) copy(text, SECRET_LABEL[field]);
  }

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

  const categoryOptions = useMemo(
    () =>
      topCategories.flatMap((c) => [
        { id: c.id, label: c.name },
        ...subcategories(c.id).map((s) => ({ id: s.id, label: `  ${s.name}` })),
      ]),
    [topCategories, subcategories],
  );

  const canDragCategories = folderSort === "custom";
  const categorySiblings = (category: VaultCategory) =>
    category.parent_id ? subcategories(category.parent_id) : topCategories;

  const currentCategory = view.kind === "category" ? categories.find((c) => c.id === view.id) ?? null : null;

  // A category shows its own entries plus those in its subcategories.
  const inCategory = useCallback(
    (entry: VaultEntry, id: string) =>
      entry.category_id === id || categories.some((c) => c.id === entry.category_id && c.parent_id === id),
    [categories],
  );

  // ---------- Which entries to show ----------

  const searching = query.trim().length > 0;

  // Search only looks at the plain fields; passwords and API keys are never searched.
  const visibleEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries
      .filter((e) => {
        if (q) return [e.name, e.url, e.username, e.note, categoryPath(e.category_id)].some((t) => t.toLowerCase().includes(q));
        if (view.kind === "uncategorized") return !e.category_id;
        if (view.kind === "category") return inCategory(e, view.id);
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
  }, [entries, query, view, categoryPath, inCategory]);

  const countIn = (id: string) => entries.filter((e) => inCategory(e, id)).length;

  // ---------- Entry actions ----------

  async function saveEntry(
    existing: VaultEntry | null,
    fields: Pick<VaultEntry, "name" | "url" | "username" | "note" | "category_id"> & Record<Secret, string>,
  ) {
    if (!key) {
      notify("The vault locked. Unlock it and try again.", true);
      return false;
    }
    // A new entry gets its id here, so its secrets can be tied to it before saving.
    const id = existing?.id ?? crypto.randomUUID();
    const seal = (field: Secret) =>
      fields[field] ? encrypt(key, fields[field], secretContext(id, field)) : Promise.resolve(null);
    const row = {
      name: fields.name,
      url: fields.url,
      username: fields.username,
      note: fields.note,
      category_id: fields.category_id,
      password: await seal("password"),
      api_key: await seal("api_key"),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = existing
      ? await supabase.from("vault_entries").update(row).eq("id", id).select().single()
      : await supabase.from("vault_entries").insert({ ...row, id }).select().single();
    if (error) {
      notify(error.message, true);
      return false;
    }
    const saved = data as VaultEntry;
    setEntries((prev) => (existing ? prev.map((e) => (e.id === id ? saved : e)) : [...prev, saved]));
    setRevealed((prev) => without(prev, secretContext(id, "password"), secretContext(id, "api_key")));
    notify(existing ? "Saved" : `Added "${saved.name}"`);
    return true;
  }

  async function moveEntry(id: string, categoryId: string | null) {
    const entry = entries.find((e) => e.id === id);
    if (!entry || entry.category_id === categoryId) return;
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, category_id: categoryId } : e)));
    const { error } = await supabase.from("vault_entries").update({ category_id: categoryId }).eq("id", id);
    if (error) {
      notify(error.message, true);
      load();
    } else notify(`Moved to ${categoryPath(categoryId) || "Uncategorized"}`);
  }

  async function deleteEntry(entry: VaultEntry) {
    if (!window.confirm(`Delete "${entry.name}" from your vault?\nThis can't be undone.`)) return;
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    const { error } = await supabase.from("vault_entries").delete().eq("id", entry.id);
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
      .from("vault_categories")
      .insert({ name: name.slice(0, NAME_MAX), parent_id: parentId, position })
      .select()
      .single();
    if (error) return notify(error.message, true);
    setCategories((prev) => [...prev, data as VaultCategory]);
    openView({ kind: "category", id: (data as VaultCategory).id });
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
      changed.map((c) => supabase.from("vault_categories").update({ position: c.position }).eq("id", c.id)),
    );
    const failed = results.find((r) => r.error);
    if (failed) {
      notify(failed.error!.message, true);
      load();
    }
  }

  function openCategoryMenu(category: VaultCategory, e: React.MouseEvent) {
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

  // What happens when something is dropped on a category: an entry moves into it,
  // a category next to it takes its place.
  const dropOnCategory = (category: VaultCategory) => {
    if (draggingId) return () => moveEntry(draggingId, category.id);
    const dragged = categories.find((c) => c.id === draggingCategoryId);
    if (dragged && dragged.id !== category.id && dragged.parent_id === category.parent_id) {
      return () => moveCategoryTo(dragged.id, category.id);
    }
    return undefined;
  };

  async function renameCategory(category: VaultCategory) {
    const name = window.prompt("Rename:", category.name)?.trim().slice(0, NAME_MAX);
    if (!name || name === category.name) return;
    setCategories((prev) => prev.map((c) => (c.id === category.id ? { ...c, name } : c)));
    const { error } = await supabase.from("vault_categories").update({ name }).eq("id", category.id);
    if (error) {
      notify(error.message, true);
      load();
    }
  }

  async function deleteCategory(category: VaultCategory) {
    const subs = category.parent_id ? "" : " and its subcategories";
    const ok = window.confirm(
      `Delete "${category.name}"${subs}?\nThe entries inside will move to Uncategorized, not be deleted.`,
    );
    if (!ok) return;
    const { error } = await supabase.from("vault_categories").delete().eq("id", category.id);
    if (error) return notify(error.message, true);
    setView({ kind: "all" });
    load();
  }

  async function signOut() {
    lock();
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
      ? "All entries"
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
        <span className="hidden text-lg font-bold sm:inline">📚 StudyShelf</span>
        <SectionSwitch active="vault" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search names, web addresses, user IDs…"
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
          <NavItem label="🔐 All entries" count={entries.length} active={view.kind === "all" && !searching} onClick={() => openView({ kind: "all" })} />
          <NavItem
            label="📥 Uncategorized"
            count={entries.filter((e) => !e.category_id).length}
            active={view.kind === "uncategorized" && !searching}
            onClick={() => openView({ kind: "uncategorized" })}
            onDropArticle={draggingId ? () => moveEntry(draggingId, null) : undefined}
          />

          <div className="mt-4 mb-1 flex items-center justify-between px-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Categories
            <FolderSortSelect sort={folderSort} onChange={setFolderSort} />
            <button onClick={() => createCategory(null)} className="rounded px-1.5 text-base text-slate-700 hover:bg-slate-100" title="New category">
              +
            </button>
          </div>
          {topCategories.length === 0 && (
            <p className="px-2 text-sm text-slate-500">No categories yet. Click + to make one, like &quot;API keys&quot;.</p>
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

          {vaultKey && (
            <button
              onClick={() => setResetting(true)}
              className="mt-6 block px-2 text-sm text-red-600 underline"
              title="Forgot your passphrase? Start over with a new one."
            >
              Reset vault…
            </button>
          )}
          <button onClick={signOut} className="mt-3 px-2 text-sm text-slate-500 underline sm:hidden">
            Sign out
          </button>
        </aside>

        <main className="min-w-0 flex-1 p-4 md:p-6">
          {needsSetup ? (
            <SetupNotice file="vault.sql" />
          ) : loading ? (
            <p className="text-slate-500">Loading your vault…</p>
          ) : !vaultKey ? (
            <div className="max-w-xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h1 className="mb-2 text-2xl font-bold">🔐 Set up your vault</h1>
              <p className="mb-4 text-sm text-slate-600">
                Pick a passphrase. Passwords and API keys are locked with it in your browser before they are saved, so
                nobody else can read them, not even the app. Web addresses and user IDs are not locked, so you can still
                see them if you ever forget the passphrase.
              </p>
              <PassphraseForm submitLabel="Create vault" onSubmit={createVault} />
            </div>
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

              {key ? (
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setEditing("new")}
                    className="rounded-md bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
                  >
                    + New entry
                  </button>
                  <span className="text-sm text-green-700">🔓 Unlocked. It locks itself after 5 idle minutes.</span>
                  <SmallButton onClick={lock}>🔒 Lock now</SmallButton>
                </div>
              ) : (
                <UnlockForm onCheck={checkPassphrase} onUnlock={setKey} onForgot={() => setResetting(true)} />
              )}

              {visibleEntries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-500">
                  {searching
                    ? "Nothing matches. Try another search."
                    : entries.length
                      ? "Nothing here yet. Add a new entry, or move entries in from another category."
                      : "Your vault is empty. Unlock it and tap + New entry to save your first login or API key."}
                </div>
              ) : (
                <>
                  {visibleEntries.length > 1 && (
                    <p className="mb-3 text-xs text-slate-500">Tip: drag an entry onto a category on the left to move it.</p>
                  )}
                  <ul className="flex flex-col gap-2">
                    {visibleEntries.map((entry) => (
                      <EntryRow
                        key={entry.id}
                        entry={entry}
                        unlocked={Boolean(key)}
                        revealed={revealed}
                        categoryLabel={categoryPath(entry.category_id) || "Uncategorized"}
                        categoryOptions={categoryOptions}
                        onMove={(categoryId) => moveEntry(entry.id, categoryId)}
                        dragging={draggingId === entry.id}
                        onDragStart={() => setDraggingId(entry.id)}
                        onDragEnd={() => setDraggingId(null)}
                        onReveal={(field) => toggleReveal(entry, field)}
                        onCopySecret={(field) => copySecret(entry, field)}
                        onCopy={copy}
                        onEdit={() => setEditing(entry)}
                        onDelete={() => deleteEntry(entry)}
                      />
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </main>
      </div>

      {editing && key && (
        <EntryEditor
          entry={editing === "new" ? null : editing}
          defaultCategoryId={view.kind === "category" ? view.id : null}
          categoryOptions={categoryOptions}
          openSecret={openSecret}
          onSave={saveEntry}
          onClose={() => setEditing(null)}
        />
      )}

      {resetting && <ResetDialog onReset={resetVault} onClose={() => setResetting(false)} />}

      {menu && <ContextMenu menu={menu} onClose={closeMenu} />}

      {toast && (
        <div
          className={`fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-2 text-sm text-white shadow-lg ${toast.isError ? "bg-red-600" : "bg-slate-900"}`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

// ---------- Pieces ----------

function EntryRow(props: {
  entry: VaultEntry;
  unlocked: boolean;
  revealed: Record<string, string>;
  categoryLabel: string;
  categoryOptions: { id: string; label: string }[];
  onMove: (categoryId: string | null) => void;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onReveal: (field: Secret) => void;
  onCopySecret: (field: Secret) => void;
  onCopy: (text: string, what: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { entry } = props;
  const href = /^https?:\/\//i.test(entry.url) ? entry.url : entry.url ? `https://${entry.url}` : "";
  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", entry.name);
        props.onDragStart();
      }}
      onDragEnd={props.onDragEnd}
      className={`flex cursor-grab items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition ${props.dragging ? "opacity-40" : ""}`}
    >
      <span className="mt-0.5 text-xl" aria-hidden>
        🔑
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="font-medium">{entry.name}</p>
        {entry.url && (
          <PlainLine label="Web address">
            <a href={href} target="_blank" rel="noopener noreferrer" className="truncate text-blue-700 hover:underline">
              {entry.url}
            </a>
          </PlainLine>
        )}
        {entry.username && (
          <PlainLine label="User ID">
            <span className="truncate font-mono">{entry.username}</span>
            <SmallButton onClick={() => props.onCopy(entry.username, "User ID")}>Copy</SmallButton>
          </PlainLine>
        )}
        {(["password", "api_key"] as Secret[]).map((field) => {
          if (!entry[field]) return null;
          const shown = props.revealed[secretContext(entry.id, field)];
          return (
            <PlainLine key={field} label={SECRET_LABEL[field]}>
              {props.unlocked ? (
                <>
                  <span className="truncate font-mono">{shown ?? "••••••••••"}</span>
                  <SmallButton onClick={() => props.onReveal(field)}>{shown === undefined ? "Show" : "Hide"}</SmallButton>
                  <SmallButton onClick={() => props.onCopySecret(field)}>Copy</SmallButton>
                </>
              ) : (
                <span className="text-slate-400">🔒 Locked</span>
              )}
            </PlainLine>
          );
        })}
        {entry.note && <p className="text-sm whitespace-pre-wrap text-slate-600">{entry.note}</p>}
        <p className="text-xs text-slate-400">Updated {formatDate(entry.updated_at)}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <select
            value={entry.category_id ?? ""}
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
          {props.unlocked && <SmallButton onClick={props.onEdit}>Edit</SmallButton>}
          <SmallButton onClick={props.onDelete} danger title="Delete">
            🗑 Delete
          </SmallButton>
        </div>
      </div>
    </li>
  );
}

function PlainLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm">
      <span className="w-24 shrink-0 text-xs text-slate-500">{label}</span>
      {children}
    </div>
  );
}

function UnlockForm(props: {
  onCheck: (passphrase: string) => Promise<CryptoKey | null>;
  onUnlock: (key: CryptoKey) => void;
  onForgot: () => void;
}) {
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);

  async function submit() {
    if (!passphrase || busy) return;
    setBusy(true);
    const key = await props.onCheck(passphrase);
    setBusy(false);
    setWrong(!key);
    if (!key) return;
    // Empty the box before it goes away, so the browser has nothing to offer to save.
    setPassphrase("");
    await afterPaint();
    props.onUnlock(key);
  }

  return (
    <NoSaveForm onSubmit={submit} className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <p className="mb-2 text-sm text-slate-700">
        🔒 Your vault is locked. Enter your passphrase to see, copy or change passwords and API keys.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          {...secretInput(false)}
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          placeholder="Vault passphrase"
          autoFocus
          className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2"
        />
        <button
          type="button"
          onClick={submit}
          disabled={busy || !passphrase}
          className="rounded-md bg-blue-600 px-4 py-2 font-semibold whitespace-nowrap text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {busy ? "Unlocking…" : "Unlock"}
        </button>
      </div>
      {wrong && <p className="mt-2 text-sm text-red-600">That passphrase doesn&apos;t match. Please try again.</p>}
      <button type="button" onClick={props.onForgot} className="mt-2 text-xs text-slate-500 underline">
        Forgot your passphrase?
      </button>
    </NoSaveForm>
  );
}

// Choose a new passphrase (typed twice), with a button that suggests five random words.
function PassphraseForm({ submitLabel, onSubmit }: { submitLabel: string; onSubmit: (passphrase: string) => Promise<void> }) {
  const [passphrase, setPassphrase] = useState("");
  const [again, setAgain] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const tooShort = passphrase.length < PASSPHRASE_MIN;
  const mismatch = again.length > 0 && again !== passphrase;

  async function submit() {
    if (busy || tooShort || passphrase !== again) return;
    const chosen = passphrase;
    setBusy(true);
    // Empty the boxes before they go away, so the browser has nothing to offer to save.
    setPassphrase("");
    setAgain("");
    await afterPaint();
    await onSubmit(chosen);
    setBusy(false);
  }

  function suggest() {
    const words = suggestPassphrase();
    setPassphrase(words);
    setAgain(words);
    setShow(true);
  }

  return (
    <NoSaveForm onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          {...secretInput(show)}
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          placeholder={`New passphrase (at least ${PASSPHRASE_MIN} characters)`}
          className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 font-mono"
        />
        <button type="button" onClick={() => setShow((s) => !s)} className="rounded-md border border-slate-300 px-2 text-sm">
          {show ? "Hide" : "Show"}
        </button>
      </div>
      <input
        {...secretInput(show)}
        value={again}
        onChange={(e) => setAgain(e.target.value)}
        placeholder="Type it again"
        className="rounded-md border border-slate-300 bg-white px-3 py-2 font-mono"
      />
      <p className="text-xs text-slate-500">
        Tip: a few random words, like <i>river-candle-tiger-maple-orbit</i>, are easy to remember and hard to guess.{" "}
        <button type="button" onClick={suggest} className="text-blue-700 underline">
          Suggest one
        </button>
      </p>
      {passphrase.length > 0 && tooShort && (
        <p className="text-sm text-red-600">Use at least {PASSPHRASE_MIN} characters.</p>
      )}
      {mismatch && <p className="text-sm text-red-600">The two don&apos;t match yet.</p>}
      <p className="text-xs text-amber-700">
        Write it down somewhere safe. If you forget it, the passwords and API keys can&apos;t be recovered; you&apos;d reset
        the vault and set them again.
      </p>
      <button
        type="button"
        onClick={submit}
        disabled={busy || tooShort || passphrase !== again}
        className="self-start rounded-md bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {busy ? "Working…" : submitLabel}
      </button>
    </NoSaveForm>
  );
}

function ResetDialog({ onReset, onClose }: { onReset: (passphrase: string) => Promise<void>; onClose: () => void }) {
  const [confirmText, setConfirmText] = useState("");
  return (
    <Modal onClose={onClose}>
      <h2 className="mb-2 text-xl font-bold text-red-700">Reset vault</h2>
      <p className="mb-2 text-sm text-slate-700">
        This wipes <b>every password and API key</b> in your vault and sets a new passphrase. Names, web addresses, user
        IDs and notes stay, so you know which passwords to reset and which API keys to make again.
      </p>
      <p className="mb-3 text-sm text-slate-700">
        Type <b>RESET</b> to go ahead.
      </p>
      <input
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2"
        autoComplete="off"
      />
      {confirmText === "RESET" && <PassphraseForm submitLabel="Wipe secrets and set new passphrase" onSubmit={onReset} />}
    </Modal>
  );
}

function EntryEditor(props: {
  entry: VaultEntry | null;
  defaultCategoryId: string | null;
  categoryOptions: { id: string; label: string }[];
  openSecret: (entry: VaultEntry, field: Secret) => Promise<string | null>;
  onSave: (
    existing: VaultEntry | null,
    fields: Pick<VaultEntry, "name" | "url" | "username" | "note" | "category_id"> & Record<Secret, string>,
  ) => Promise<boolean>;
  onClose: () => void;
}) {
  const { entry, openSecret } = props;
  const [name, setName] = useState(entry?.name ?? "");
  const [url, setUrl] = useState(entry?.url ?? "");
  const [username, setUsername] = useState(entry?.username ?? "");
  const [password, setPassword] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [note, setNote] = useState(entry?.note ?? "");
  const [categoryId, setCategoryId] = useState(entry ? entry.category_id ?? "" : props.defaultCategoryId ?? "");
  const [showSecrets, setShowSecrets] = useState(false);
  const [ready, setReady] = useState(!entry);
  const [busy, setBusy] = useState(false);

  // Editing: open the saved secrets so they can be changed.
  useEffect(() => {
    if (!entry) return;
    Promise.all([openSecret(entry, "password"), openSecret(entry, "api_key")]).then(([p, a]) => {
      setPassword(p ?? "");
      setApiKey(a ?? "");
      setReady(true);
    });
  }, [entry, openSecret]);

  async function submit() {
    if (busy || !ready || !name.trim()) return;
    const secrets = { password, api_key: apiKey };
    setBusy(true);
    // Empty the secret boxes before the editor goes away, so the browser has nothing to offer to save.
    setPassword("");
    setApiKey("");
    await afterPaint();
    const ok = await props.onSave(entry, {
      name: name.trim(),
      url: url.trim(),
      username: username.trim(),
      note: note.trim(),
      category_id: categoryId || null,
      ...secrets,
    });
    setBusy(false);
    if (ok) return props.onClose();
    setPassword(secrets.password);
    setApiKey(secrets.api_key);
  }

  const input = "w-full rounded-md border border-slate-300 bg-white px-3 py-2";

  return (
    <Modal onClose={props.onClose}>
      <NoSaveForm onSubmit={submit} className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">{entry ? "Edit entry" : "New entry"}</h2>
        <Field label="Name" hint="Like “Gmail” or “OpenAI API”">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={NAME_MAX} required className={input} autoFocus />
        </Field>
        <Field label="Web address">
          <input value={url} onChange={(e) => setUrl(e.target.value)} maxLength={FIELD_MAX} placeholder="https://…" className={input} />
        </Field>
        <Field label="User ID">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={FIELD_MAX}
            autoComplete="off"
            className={input}
          />
        </Field>
        <Field label="Password 🔒" hint="Encrypted">
          <div className="flex gap-2">
            <input
              {...secretInput(showSecrets)}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              maxLength={FIELD_MAX}
              disabled={!ready}
              className={`${input} font-mono`}
            />
            <button
              type="button"
              onClick={() => {
                setPassword(randomPassword());
                setShowSecrets(true);
              }}
              className="rounded-md border border-slate-300 px-2 text-sm whitespace-nowrap"
              title="Make a strong random password"
            >
              Generate
            </button>
          </div>
        </Field>
        <Field label="API key 🔒" hint="Encrypted">
          <input
            {...secretInput(showSecrets)}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            maxLength={FIELD_MAX}
            disabled={!ready}
            className={`${input} font-mono`}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showSecrets} onChange={(e) => setShowSecrets(e.target.checked)} />
          Show password and API key
        </label>
        <Field label="Note" hint="Not encrypted. Don't put secrets here.">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={FIELD_MAX} rows={2} className={input} />
        </Field>
        <Field label="Category">
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={input}>
            <option value="">📥 Uncategorized</option>
            {props.categoryOptions.map((c) => (
              <option key={c.id} value={c.id}>
                🏷️ {c.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={busy || !ready || !name.trim()}
            className="rounded-md bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={props.onClose} className="rounded-md border border-slate-300 px-4 py-2">
            Cancel
          </button>
        </div>
      </NoSaveForm>
    </Modal>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium">
        {label}
        {hint && <span className="ml-2 text-xs font-normal text-slate-500">{hint}</span>}
      </span>
      {children}
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onMouseDown={onClose}>
      <div className="mt-10 w-full max-w-lg rounded-xl bg-white p-5 shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// Works like a form (Enter submits) without being one: Safari offers to save a password
// whenever a real form with a secret in it is sent, even when the fields aren't password boxes.
function NoSaveForm({ onSubmit, className, children }: { onSubmit: () => void; className?: string; children: React.ReactNode }) {
  return (
    <div
      className={className}
      onKeyDown={(e) => {
        if (e.key !== "Enter" || !(e.target instanceof HTMLInputElement)) return;
        e.preventDefault();
        onSubmit();
      }}
    >
      {children}
    </div>
  );
}

// Waits until the screen has redrawn, so emptied boxes are really empty before they go away.
const afterPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

// Secret fields are plain text boxes drawn as dots, so Safari and other browsers don't
// treat them as a login and offer to save the vault passphrase or the passwords in it.
// Browsers that can't draw the dots fall back to a normal password box.
function secretInput(shown: boolean) {
  const canMask = typeof CSS !== "undefined" && CSS.supports("-webkit-text-security", "disc");
  return {
    type: shown || canMask ? "text" : "password",
    style: shown ? undefined : ({ WebkitTextSecurity: "disc" } as React.CSSProperties),
    autoComplete: "off",
    autoCorrect: "off",
    autoCapitalize: "off",
    spellCheck: false,
    "data-1p-ignore": true,
    "data-lpignore": "true",
  };
}

// 20 random letters, digits and symbols.
function randomPassword(length = 20) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+";
  return Array.from(crypto.getRandomValues(new Uint32Array(length)), (n) => chars[n % chars.length]).join("");
}
