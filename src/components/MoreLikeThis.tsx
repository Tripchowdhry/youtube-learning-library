"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SectionIcon } from "@/components/AppSearch";
import { SECTIONS, type Section } from "@/components/FoundElsewhere";
import { createClient } from "@/lib/supabase/client";

// How many to show, and how close in meaning (0 to 1) an item has to be to count as "like this".
const SHOW = 3;
const CLOSE_ENOUGH = 0.6;

type Similar = { section: Section; id: string; title: string; sub: string; href: string; score: number };

// Where each tab's items are kept, and the page that opens one.
const SOURCES: Record<Section, { table: string; columns: string; href: (id: string) => string }> = {
  videos: { table: "videos", columns: "id, title, channel", href: (id) => `/video/${id}` },
  reading: { table: "articles", columns: "id, title, url, site", href: (id) => `/read/${id}` },
  tutorial: { table: "articles", columns: "id, title, url, site", href: (id) => `/read/${id}` },
  scrapbook: { table: "scraps", columns: "id, title", href: (id) => `/scrap/${id}` },
  reports: { table: "reports", columns: "id, title", href: (id) => `/report/${id}` },
};

// Found once per item per visit, so showing it twice on a page (laptop and phone layouts) asks once.
const found = new Map<string, Promise<Similar[]>>();

async function findSimilar(kinds: Section[], id: string): Promise<Similar[]> {
  const supabase = createClient();
  // This item's meaning fingerprint, made in the background by the ⌘K search (see meaning-sync.ts).
  const own = await supabase.from("item_meanings").select("kind, embedding").eq("item_id", id).in("kind", kinds).limit(1).maybeSingle();
  if (own.error || !own.data?.embedding) return [];
  const { data, error } = await supabase.rpc("match_item_meanings", { query_embedding: own.data.embedding, match_count: SHOW * 3 + 1 });
  if (error || !Array.isArray(data)) return [];
  const close = (data as { kind: Section; item_id: string; score: number }[])
    .filter((m) => m.item_id !== id && SOURCES[m.kind] && m.score >= CLOSE_ENOUGH)
    .slice(0, SHOW * 2);
  if (!close.length) return [];

  // Their titles, read from each tab (an item deleted since simply drops out).
  const rows = new Map<string, Record<string, unknown>>();
  const byTable = new Map<string, { columns: string; ids: string[] }>();
  for (const m of close) {
    const s = SOURCES[m.kind];
    const entry = byTable.get(s.table) ?? { columns: s.columns, ids: [] };
    entry.ids.push(m.item_id);
    byTable.set(s.table, entry);
  }
  await Promise.all(
    [...byTable].map(async ([table, { columns, ids }]) => {
      const { data } = await supabase.from(table).select(columns).in("id", ids);
      for (const r of (data ?? []) as unknown as Record<string, unknown>[]) rows.set(`${table}:${r.id}`, r);
    }),
  );
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  return close
    .flatMap((m) => {
      const s = SOURCES[m.kind];
      const r = rows.get(`${s.table}:${m.item_id}`);
      if (!r) return [];
      return [{ section: m.kind, id: m.item_id, title: text(r.title) || text(r.url) || "Untitled", sub: text(r.channel) || text(r.site), href: s.href(m.item_id), score: m.score }];
    })
    .slice(0, SHOW);
}

// "More like this": the few saved items closest in meaning to the one you're on, from any tab.
// Uses the fingerprints search by meaning already keeps, so it costs no AI. Shows nothing until
// supabase/meaning-search.sql has been run and this item has its fingerprint.
export default function MoreLikeThis({ kinds, id, className = "" }: { kinds: Section[]; id: string; className?: string }) {
  const [items, setItems] = useState<Similar[]>([]);
  const key = `${kinds.join(",")}:${id}`;

  useEffect(() => {
    let live = true;
    if (!found.has(key)) found.set(key, findSimilar(kinds, id).catch(() => []));
    found.get(key)!.then((list) => live && setItems(list));
    return () => {
      live = false;
    };
    // `key` stands for kinds and id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!items.length) return null;
  const sectionName = (s: Section) => SECTIONS.find((x) => x.key === s)?.name ?? "";
  return (
    <section aria-label="More like this" className={`rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200 ${className}`}>
      <h2 className="flex items-center gap-1.5 px-1 pb-1.5 text-xs font-semibold text-slate-500" title="Saved items about the same idea, from any tab">
        <Sparkles size={14} aria-hidden className="text-slate-400" />
        More like this
      </h2>
      <ul className="flex flex-col">
        {items.map((it) => (
          <li key={it.href}>
            <Link
              href={it.href}
              title={`How close in meaning: ${Math.round(it.score * 100)}%`}
              className="flex items-start gap-2.5 rounded-md px-1.5 py-1.5 text-left hover:bg-slate-50"
            >
              <span className="mt-0.5 shrink-0">
                <SectionIcon section={it.section} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900">{it.title}</span>
                <span className="block truncate text-xs text-slate-500">{[sectionName(it.section), it.sub].filter(Boolean).join(" · ")}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
