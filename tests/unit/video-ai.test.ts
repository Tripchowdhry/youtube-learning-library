import { afterEach, describe, expect, it, vi } from "vitest";
import { askVideoAi } from "@/lib/video-ai";

afterEach(() => vi.unstubAllGlobals());

function replies(list: { status: number; body: object }[]) {
  const attempts: number[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      attempts.push(JSON.parse(init.body).attempt);
      const r = list[attempts.length - 1];
      return new Response(JSON.stringify(r.body), { status: r.status });
    }),
  );
  return attempts;
}

describe("askVideoAi", () => {
  it("asks the next model, one request each, until one answers", async () => {
    const attempts = replies([
      { status: 504, body: { error: "slow", tryNext: true } },
      { status: 429, body: { error: "limit", tryNext: true } },
      { status: 200, body: { text: "answer", model: "Gemini 3.5 Flash Lite" } },
    ]);
    const notes: string[] = [];
    const result = await askVideoAi({ youtubeId: "x", task: "note" }, undefined, (n) => notes.push(n));
    expect(attempts).toEqual([0, 1, 2]);
    expect(result).toEqual({ text: "answer", model: "Gemini 3.5 Flash Lite" });
    expect(notes).toHaveLength(2);
  });

  it("stops when no other model is worth trying, showing the used-up limit first", async () => {
    replies([
      { status: 429, body: { error: "The free AI limit is used up", tryNext: true } },
      { status: 502, body: { error: "other", tryNext: false } },
    ]);
    const result = await askVideoAi({ youtubeId: "x", task: "ask", prompt: "hi" });
    expect(result.error).toBe("The free AI limit is used up");
  });
});
