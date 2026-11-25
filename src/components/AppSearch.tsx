"use client";

import {
  ArrowRight,
  Clapperboard,
  Clock,
  CornerDownLeft,
  FileText,
  GraduationCap,
  NotebookPen,
  Search,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  SECTIONS,
  loadEverything,
  searchHref,
  type Entry,
  type Section,
} from "@/components/FoundElsewhere";
import { Ico, type Tone } from "@/components/Icon";
import BrandStripe from "@/components/BrandStripe";
import { ReportIcon } from "@/components/ReportWriterLink";
import { readRecent, writeRecent } from "@/components/SearchBox";
import { Highlight } from "@/components/SearchHighlight";
import {
  bestFirst,
  hashTag,
  matches,
  queryWords,
  tagTest,
  whereFound,
} from "@/lib/search";
import { searchMeaning, syncMeanings } from "@/lib/meaning-sync";
import { createClient } from "@/lib/supabase/client";

// How many results each tab shows before "See all".
const PER_SECTION = 5;
const RECENT_KEY = "recent-searches:everywhere";
const RECENT_MAX = 5;
// Search by meaning: how many "Related" items to show, and how long typing pauses before asking.
const RELATED_MAX = 5;
const RELATED_WAIT_MS = 450;

const ICONS: Record<
  Exclude<Section, "reports">,
  { Icon: LucideIcon; tone: Tone }
> = {
  videos: { Icon: Clapperboard, tone: "red" },
  reading: { Icon: FileText, tone: "blue" },
  tutorial: { Icon: GraduationCap, tone: "green" },
  scrapbook: { Icon: NotebookPen, tone: "amber" },
};
const SectionIcon = ({ section }: { section: Section }) =>
  section === "reports" ? (
    <ReportIcon size={16} />
  ) : (
    <Ico icon={ICONS[section].Icon} tone={ICONS[section].tone} />
  );

// Each tab's colour from the BrainShelf logo's books (Reports keep their lavender): a thin line
// down the side of its group of results, and a soft tint on the result you're on.
const SHELF: Record<Section, { line: string; tint: string }> = {
  videos: { line: "border-red-400", tint: "bg-red-50" },
  reading: { line: "border-blue-400", tint: "bg-blue-50" },
  tutorial: { line: "border-green-500", tint: "bg-green-50" },
  scrapbook: { line: "border-amber-400", tint: "bg-amber-50" },
  reports: { line: "border-violet-400", tint: "bg-violet-50" },
};

type Row =
  | { kind: "item"; entry: Entry; section: Section | "related" }
  | {
      kind: "all";
      section: Section;
      count: number;
      path: string;
      name: string;
    };

// One search box for the whole app: ⌘K (Ctrl K) anywhere opens it. Results are grouped by tab,
// the best matches first, and each opens the item where it lives. Vault is never searched here.
export default function AppSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  // Items close in meaning to the search, for the search they were found for.
  const [related, setRelated] = useState<{ q: string; items: Entry[] } | null>(
    null,
  );
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  // Only for someone signed in: there's nothing to search otherwise.
  async function show(q: string) {
    const { data } = await createClient().auth.getSession();
    if (!data.session) return;
    setQuery(q);
    setActive(0);
    setRecent(readRecent(RECENT_KEY));
    setOpen(true);
    // Read again each time, so something saved a moment ago is found; the last copy shows meanwhile.
    loadEverything(true).then((list) => {
      setEntries(list);
      // Keeps meaning fingerprints up to date in the background, for "Related" results.
      syncMeanings(list);
    });
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() !== "k" ||
        !(e.metaKey || e.ctrlKey) ||
        e.altKey ||
        e.shiftKey
      )
        return;
      // Editors keep ⌘K for themselves (adding a link).
      if ((e.target as HTMLElement | null)?.isContentEditable) return;
      e.preventDefault();
      if (open) setOpen(false);
      else show("");
    };
    const onOpen = (e: Event) =>
      show(
        typeof (e as CustomEvent).detail === "string"
          ? (e as CustomEvent).detail
          : "",
      );
    window.addEventListener("keydown", onKey);
    window.addEventListener("app-search:open", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("app-search:open", onOpen);
    };
  }, [open]);

  // The page behind doesn't scroll while the search is open.
  useEffect(() => {
    if (!open) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
    };
  }, [open]);

  const q = query.trim();
  const typed = hashTag(q);
  const words = useMemo(
    () => (typed === null ? queryWords(q) : []),
    [q, typed],
  );

  const groups = useMemo(() => {
    if (!entries || !q || (typed === null && !words.length)) return [];
    const tagOk = tagTest(null, typed);
    const found = entries.filter((e) =>
      tagOk ? tagOk(e.tags) : matches(e.index, words),
    );
    found.sort(
      bestFirst(
        words,
        (e: Entry) => e.index,
        () => 0,
      ),
    );
    return SECTIONS.map((s) => ({
      ...s,
      items: found.filter((e) => e.section === s.key),
    })).filter((g) => g.items.length);
  }, [entries, q, typed, words]);

  // Search by meaning, once typing pauses: items about the same idea, even with none of the words.
  const meaningQuery = typed === null && q.length >= 3 ? q : "";
  useEffect(() => {
    if (!meaningQuery || !entries) return;
    let live = true;
    const wait = setTimeout(
      () =>
        searchMeaning(meaningQuery, entries).then(
          (items) => live && setRelated({ q: meaningQuery, items }),
        ),
      RELATED_WAIT_MS,
    );
    return () => {
      live = false;
      clearTimeout(wait);
    };
  }, [meaningQuery, entries]);
  const relatedItems = useMemo(() => {
    if (!related || related.q !== meaningQuery) return [];
    const shown = new Set(
      groups.flatMap((g) => g.items.slice(0, PER_SECTION)).map((e) => e.href),
    );
    return related.items
      .filter((e) => !shown.has(e.href))
      .slice(0, RELATED_MAX);
  }, [related, meaningQuery, groups]);
  const relatedPending = !!meaningQuery && related?.q !== meaningQuery;

  // Everything the arrow keys move through, in the order shown.
  const rows: Row[] = useMemo(
    () => [
      ...groups.flatMap((g) => [
        ...g.items
          .slice(0, PER_SECTION)
          .map((entry) => ({ kind: "item" as const, entry, section: g.key })),
        ...(g.items.length > PER_SECTION
          ? [
              {
                kind: "all" as const,
                section: g.key,
                count: g.items.length,
                path: g.path,
                name: g.name,
              },
            ]
          : []),
      ]),
      ...relatedItems.map((entry) => ({
        kind: "item" as const,
        entry,
        section: "related" as const,
      })),
    ],
    [groups, relatedItems],
  );
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    list.current
      ?.querySelector(`[data-row="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function remember() {
    if (q.length < 2) return;
    const next = [
      q,
      ...recent.filter((r) => r.toLowerCase() !== q.toLowerCase()),
    ].slice(0, RECENT_MAX);
    setRecent(next);
    writeRecent(RECENT_KEY, next);
  }

  function go(row: Row | undefined) {
    if (!row) return;
    remember();
    setOpen(false);
    router.push(row.kind === "item" ? row.entry.href : searchHref(row.path, q));
  }

  if (!open) return null;

  const loading = entries === null;
  let at = -1;
  const rowProps = (i: number, section: Section | "related") => ({
    "data-row": i,
    onMouseMove: () => setActive(i),
    className: `flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left ${i === active ? (section === "related" ? "bg-slate-100" : SHELF[section].tint) : ""}`,
  });
  const sectionName = (s: Section) =>
    SECTIONS.find((x) => x.key === s)?.name ?? "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 sm:px-4 sm:pt-[12vh]"
      onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search your BrainShelf"
        className="flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[70vh] sm:max-w-xl sm:rounded-xl sm:ring-1 sm:ring-slate-200"
      >
        {/* The logo's four book colours, like spines on a shelf. */}
        <BrandStripe />
        <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2.5">
          <Search size={18} aria-hidden className="shrink-0 text-slate-400" />
          <input
            ref={input}
            autoFocus
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
              } else if (e.key === "ArrowDown" && rows.length) {
                e.preventDefault();
                setActive((a) => (a + 1) % rows.length);
              } else if (e.key === "ArrowUp" && rows.length) {
                e.preventDefault();
                setActive((a) => (a - 1 + rows.length) % rows.length);
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(rows[active]);
              }
            }}
            placeholder="Search your BrainShelf…"
            aria-label="Search your BrainShelf"
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-slate-400 sm:text-sm [&::-webkit-search-cancel-button]:appearance-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                input.current?.focus();
              }}
              aria-label="Clear search"
              title="Clear search"
              className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={14} aria-hidden />
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="shrink-0 rounded-md px-1.5 py-1 text-sm text-slate-600 hover:bg-slate-100 sm:hidden"
          >
            Cancel
          </button>
          {/* Esc closes it from the keyboard; clicking the label does the same. */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            title="Close (Esc)"
            aria-label="Close search"
            className="hidden shrink-0 rounded border border-slate-200 px-1.5 text-[11px] text-slate-400 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 sm:block"
          >
            Esc
          </button>
        </div>

        <div ref={list} className="min-h-0 flex-1 overflow-y-auto p-2">
          {!q ? (
            <div className="flex flex-col gap-1">
              {recent.length > 0 && (
                <>
                  <p className="px-2.5 pt-1 pb-0.5 text-xs text-slate-500">
                    Recent searches
                  </p>
                  {recent.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setQuery(r)}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100"
                    >
                      <Clock
                        size={14}
                        aria-hidden
                        className="shrink-0 text-slate-400"
                      />
                      <span className="truncate">{r}</span>
                    </button>
                  ))}
                </>
              )}
              <p className="px-2.5 py-2 text-xs text-slate-500">
                Looks in titles, summaries, notes and tags across every tab.
                Type <span className="font-mono">#</span> to find a tag.
              </p>
            </div>
          ) : loading ? (
            <p className="px-2.5 py-6 text-center text-sm text-slate-500">
              Searching…
            </p>
          ) : !groups.length && !relatedItems.length ? (
            <p className="px-2.5 py-6 text-center text-sm text-slate-500">
              {relatedPending ? (
                "Searching…"
              ) : (
                <>Nothing matches &ldquo;{q}&rdquo; in any tab.</>
              )}
            </p>
          ) : (
            <>
              {!groups.length && (
                <p className="px-2.5 pt-2 pb-1 text-xs text-slate-500">
                  No item has these words, but these are about the same idea.
                </p>
              )}
              {groups.map((g) => (
                <section
                  key={g.key}
                  className={`mb-2 border-l-2 pl-1 ${SHELF[g.key].line}`}
                >
                  <h3 className="flex items-center gap-1.5 px-2.5 pt-2 pb-1 text-xs font-semibold text-slate-500">
                    <SectionIcon section={g.key} />
                    {g.name}
                    <span className="font-normal text-slate-400">
                      {g.items.length}
                    </span>
                  </h3>
                  {g.items.slice(0, PER_SECTION).map((entry) => {
                    const i = ++at;
                    const found = words.length
                      ? whereFound(entry.index, words)
                      : null;
                    return (
                      <button
                        key={entry.href}
                        type="button"
                        onClick={() => go(rows[i])}
                        {...rowProps(i, g.key)}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-900">
                            <Highlight text={entry.title} words={words} />
                          </span>
                          {found ? (
                            <span className="block truncate text-xs text-slate-500">
                              <span className="text-slate-600">
                                In {found.label}:{" "}
                              </span>
                              <Highlight text={found.snippet} words={words} />
                            </span>
                          ) : (
                            entry.sub && (
                              <span className="block truncate text-xs text-slate-500">
                                {entry.sub}
                              </span>
                            )
                          )}
                        </span>
                        {i === active && (
                          <CornerDownLeft
                            size={14}
                            aria-hidden
                            className="mt-0.5 hidden shrink-0 text-slate-400 sm:block"
                          />
                        )}
                      </button>
                    );
                  })}
                  {g.items.length > PER_SECTION &&
                    (() => {
                      const i = ++at;
                      return (
                        <button
                          type="button"
                          onClick={() => go(rows[i])}
                          {...rowProps(i, g.key)}
                        >
                          <span className="flex items-center gap-1 text-xs font-medium text-blue-700">
                            See all {g.items.length} in {g.name}
                            <ArrowRight size={12} aria-hidden />
                          </span>
                        </button>
                      );
                    })()}
                </section>
              ))}
              {relatedItems.length > 0 && (
                <section className="mb-2 border-l-2 border-slate-300 pl-1">
                  <h3
                    className="flex items-center gap-1.5 px-2.5 pt-2 pb-1 text-xs font-semibold text-slate-500"
                    title="Found by meaning: about the same idea, even without the same words"
                  >
                    <Sparkles
                      size={14}
                      aria-hidden
                      className="text-slate-400"
                    />
                    Related
                    <span className="font-normal text-slate-400">
                      by meaning
                    </span>
                  </h3>
                  {relatedItems.map((entry) => {
                    const i = ++at;
                    return (
                      <button
                        key={entry.href}
                        type="button"
                        onClick={() => go(rows[i])}
                        {...rowProps(i, "related")}
                      >
                        <span className="mt-0.5 shrink-0">
                          <SectionIcon section={entry.section} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-900">
                            {entry.title}
                          </span>
                          <span className="block truncate text-xs text-slate-500">
                            {[sectionName(entry.section), entry.sub]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                        {i === active && (
                          <CornerDownLeft
                            size={14}
                            aria-hidden
                            className="mt-0.5 hidden shrink-0 text-slate-400 sm:block"
                          />
                        )}
                      </button>
                    );
                  })}
                </section>
              )}
            </>
          )}
        </div>

        {q && !loading && total + relatedItems.length > 0 && (
          <div className="hidden items-center justify-between border-t border-slate-200 px-3 py-1.5 text-[11px] text-slate-400 sm:flex">
            <span>
              {[
                total > 0 && `${total} result${total === 1 ? "" : "s"}`,
                relatedItems.length > 0 && `${relatedItems.length} related`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
            <span>↑↓ to move · Enter to open · Esc to close</span>
          </div>
        )}
      </div>
    </div>
  );
}
