import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteLeftoverClips, joinTypedClips, videoNoteClipPaths } from "@/lib/clips";
import type { NotePage } from "@/lib/types";

const page = (...paths: string[]) => ({ images: paths.map((path) => ({ path })) }) as unknown as NotePage;

// A stand-in for Supabase: tables to read, and a record of the pictures deleted.
function fakeSupabase(tables: Record<string, unknown[]>) {
  const removed: string[] = [];
  const query = (rows: unknown[]) => {
    const q = {
      select: () => q,
      order: () => q,
      range: (from: number, to: number) => Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
    };
    return q;
  };
  const client = {
    from: (table: string) => query(tables[table] ?? []),
    storage: { from: () => ({ remove: async (paths: string[]) => (removed.push(...paths), { error: null }) }) },
  };
  return { client: client as unknown as SupabaseClient, removed };
}

describe("deleting a video's pictures", () => {
  it("finds the pictures in typed and handwritten notes", () => {
    const note = { pages: [page("u/a.jpg"), page("u/b.jpg")], text: joinTypedClips("hello", [{ path: "u/c.jpg", t: 5 }, { path: "u/a.jpg", t: null }]) };
    expect(videoNoteClipPaths(note).sort()).toEqual(["u/a.jpg", "u/b.jpg", "u/c.jpg"]);
    expect(videoNoteClipPaths(null)).toEqual([]);
  });

  it("deletes them, but keeps one that's also in other notes", async () => {
    const { client, removed } = fakeSupabase({
      notes: [{ video_id: "other", pages: [], text: joinTypedClips("", [{ path: "u/b.jpg", t: null }]) }],
      articles: [],
      scraps: [],
    });
    await deleteLeftoverClips(client, ["u/a.jpg", "u/b.jpg"]);
    expect(removed).toEqual(["u/a.jpg"]);
  });

  it("does nothing when there are no pictures", async () => {
    const { client, removed } = fakeSupabase({});
    await deleteLeftoverClips(client, []);
    expect(removed).toEqual([]);
  });
});
