import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { joinTypedClips } from "@/lib/clips";
import { deleteItem } from "@/lib/delete-item";

type Row = Record<string, unknown>;

// A small stand-in for Supabase that keeps tables in memory and records what was deleted.
function fakeSupabase(tables: Record<string, Row[]>) {
  const removed: { bucket: string; paths: string[] }[] = [];
  const from = (table: string) => {
    let op: "select" | "delete" | "update" = "select";
    let patch: Row = {};
    const filters: [string, unknown][] = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v));
    const run = () => {
      if (op === "delete") {
        const gone = rows();
        tables[table] = (tables[table] ?? []).filter((r) => !gone.includes(r));
        // Like the database: a video's notes are deleted with it.
        if (table === "videos") tables.notes = (tables.notes ?? []).filter((n) => !gone.some((v) => v.id === n.video_id));
      }
      if (op === "update") rows().forEach((r) => Object.assign(r, patch));
      return { data: op === "select" ? rows() : null, error: null };
    };
    const q = {
      select: () => q,
      delete: () => ((op = "delete"), q),
      update: (p: Row) => ((op = "update"), (patch = p), q),
      eq: (k: string, v: unknown) => (filters.push([k, v]), q),
      order: () => q,
      limit: () => q,
      range: (a: number, b: number) => Promise.resolve({ data: rows().slice(a, b + 1), error: null }),
      maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
      then: (resolve: (r: unknown) => unknown) => Promise.resolve(run()).then(resolve),
    };
    return q;
  };
  const storage = {
    from: (bucket: string) => ({ remove: async (paths: string[]) => (removed.push({ bucket, paths }), { error: null }) }),
  };
  return { client: { from, storage } as unknown as SupabaseClient, tables, removed };
}

describe("deleting something deletes what belongs to it", () => {
  it("a video: its notes' pictures, its place in reports and its handwriting text there", async () => {
    const fake = fakeSupabase({
      videos: [{ id: "v1" }, { id: "v2" }],
      notes: [{ video_id: "v1", pages: [{ images: [{ path: "u/a.jpg" }] }], text: joinTypedClips("hi", [{ path: "u/b.jpg", t: 3 }]) }],
      articles: [],
      scraps: [],
      report_sources: [
        { report_id: "r1", source_kind: "video", source_id: "v1" },
        { report_id: "r1", source_kind: "video", source_id: "v2" },
      ],
      reports: [{ id: "r1", handwriting: { "video:v1": "old", "video:v2": "keep" } }],
    });
    expect(await deleteItem(fake.client, "video", "v1")).toBeNull();
    expect(fake.tables.videos).toEqual([{ id: "v2" }]);
    expect(fake.removed).toEqual([{ bucket: "clips", paths: ["u/a.jpg", "u/b.jpg"] }]);
    expect(fake.tables.report_sources.map((r) => r.source_id)).toEqual(["v2"]);
    expect(fake.tables.reports[0].handwriting).toEqual({ "video:v2": "keep" });
  });

  it("an article: its saved text, unless the same link is saved again", async () => {
    const fake = fakeSupabase({
      articles: [
        { id: "a1", url: "https://x.com/1", notes: "" },
        { id: "a2", url: "https://x.com/2", notes: "" },
        { id: "a3", url: "https://x.com/2", notes: "" },
      ],
      article_texts: [{ url: "https://x.com/1" }, { url: "https://x.com/2" }],
      notes: [],
      scraps: [],
      report_sources: [],
      reports: [],
    });
    await deleteItem(fake.client, "article", "a1");
    await deleteItem(fake.client, "article", "a2");
    expect(fake.tables.article_texts).toEqual([{ url: "https://x.com/2" }]);
  });

  it("a ScrapBook page: its pictures and attached files", async () => {
    const fake = fakeSupabase({
      scraps: [{ id: "s1", body: "", pages: [{ images: [{ path: "u/c.jpg" }] }], files: [{ path: "u/f.pdf" }] }],
      notes: [],
      articles: [],
    });
    expect(await deleteItem(fake.client, "scrap", "s1")).toBeNull();
    expect(fake.tables.scraps).toEqual([]);
    expect(fake.removed).toContainEqual({ bucket: "clips", paths: ["u/c.jpg"] });
    expect(fake.removed).toContainEqual({ bucket: "files", paths: ["u/f.pdf"] });
  });
});
