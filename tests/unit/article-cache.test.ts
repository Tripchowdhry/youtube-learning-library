import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ArticleContent } from "@/lib/types";

const readArticle = vi.fn<(url: URL) => Promise<ArticleContent>>();
vi.mock("@/lib/article-text", () => ({ readArticle: (url: URL) => readArticle(url) }));

import { readSavedArticle } from "@/lib/article-cache";

const LINK = "https://example.com/post";
const BLOCKS = [{ type: "p" as const, text: "Hello" }];

// A stand-in for the database: what article_texts and articles hold, and what gets written.
function fakeDb({ kept = null as unknown, keptError = null as unknown, saved = true } = {}) {
  const upserts: unknown[] = [];
  const db = {
    from(table: string) {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: kept, error: keptError }),
        limit: async () => ({ data: saved ? [{ id: "a1" }] : [], error: null }),
        upsert: async (row: unknown) => {
          upserts.push({ table, row });
          return { error: null };
        },
      };
      return query;
    },
  };
  return { supabase: db as unknown as SupabaseClient, upserts };
}

describe("readSavedArticle", () => {
  beforeEach(() => readArticle.mockReset());

  it("uses the kept text without reading the page", async () => {
    const { supabase, upserts } = fakeDb({ kept: { blocks: BLOCKS } });
    expect(await readSavedArticle(supabase, LINK, new URL(LINK))).toEqual({ kind: "text", blocks: BLOCKS });
    expect(readArticle).not.toHaveBeenCalled();
    expect(upserts).toEqual([]);
  });

  it("reads the page the first time and keeps the text", async () => {
    readArticle.mockResolvedValue({ kind: "text", blocks: BLOCKS });
    const { supabase, upserts } = fakeDb();
    expect(await readSavedArticle(supabase, LINK, new URL(LINK))).toEqual({ kind: "text", blocks: BLOCKS });
    expect(upserts).toEqual([{ table: "article_texts", row: { url: LINK, blocks: BLOCKS } }]);
  });

  it("doesn't keep text for a link that isn't saved", async () => {
    readArticle.mockResolvedValue({ kind: "text", blocks: BLOCKS });
    const { supabase, upserts } = fakeDb({ saved: false });
    await readSavedArticle(supabase, LINK, new URL(LINK));
    expect(upserts).toEqual([]);
  });

  it("doesn't keep a page with no text, so it's tried again next time", async () => {
    readArticle.mockResolvedValue({ kind: "none" });
    const { supabase, upserts } = fakeDb();
    expect(await readSavedArticle(supabase, LINK, new URL(LINK))).toEqual({ kind: "none" });
    expect(upserts).toEqual([]);
  });

  it("still works before the table is set up", async () => {
    readArticle.mockResolvedValue({ kind: "text", blocks: BLOCKS });
    const { supabase, upserts } = fakeDb({ keptError: { message: 'relation "article_texts" does not exist' } });
    expect(await readSavedArticle(supabase, LINK, new URL(LINK))).toEqual({ kind: "text", blocks: BLOCKS });
    expect(upserts).toEqual([]);
  });
});
