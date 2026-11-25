import { afterEach, describe, expect, it, vi } from "vitest";
import { EMBEDDING_SIZE, embedTexts, withModelAttempt, type UsageRow } from "@/lib/gemini";
import { meaningHash, meaningText, MEANING_TEXT_MAX } from "@/lib/meaning";

describe("meaning fingerprints", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks Gemini with the task in the text, and scales the numbers to length 1", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ embeddings: [{ values: Array(EMBEDDING_SIZE).fill(2) }, { values: Array(3072).fill(1) }] }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetch);
    const usage: UsageRow[] = [];
    const out = await withModelAttempt(undefined, () => embedTexts([{ text: "black holes", title: "Space" }, { text: "caching" }], "item"), usage, "meaning");
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(fetch.mock.calls[0][0]).toContain("gemini-embedding-2:batchEmbedContents");
    expect(body.requests[0].content.parts[0].text).toBe("title: Space | text: black holes");
    expect(body.requests[1].content.parts[0].text).toBe("title: none | text: caching");
    expect(body.requests[0].outputDimensionality).toBe(768);
    expect(out).toHaveLength(2);
    expect(out[1]).toHaveLength(EMBEDDING_SIZE);
    for (const v of out) expect(Math.hypot(...v)).toBeCloseTo(1);
    expect(usage[0]).toMatchObject({ feature: "meaning", ok: true });
  });

  it("marks a search as a query", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ embeddings: [{ values: Array(EMBEDDING_SIZE).fill(1) }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await embedTexts([{ text: "speed up my site" }], "query");
    expect(JSON.parse(fetch.mock.calls[0][1].body).requests[0].content.parts[0].text).toBe("task: search result | query: speed up my site");
  });

  it("reports Google's limit as 429", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "quota" } }), { status: 429 })));
    await expect(embedTexts([{ text: "x" }], "query")).rejects.toMatchObject({ status: 429 });
  });

  it("changes the hash only when the text changes", () => {
    expect(meaningHash("A", "b")).toBe(meaningHash("A", "b"));
    expect(meaningHash("A", "b")).not.toBe(meaningHash("A", "c"));
    expect(meaningText(["  a\n\n b ", "", "c"])).toBe("a b\nc");
    expect(meaningText(["x".repeat(10_000)])).toHaveLength(MEANING_TEXT_MAX);
  });
});
