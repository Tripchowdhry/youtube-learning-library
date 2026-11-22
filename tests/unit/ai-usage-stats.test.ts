import { describe, expect, it } from "vitest";
import { formatDuration, formatTokens, outcome, summarise, type UsageLogRow } from "@/lib/ai-usage-stats";

const row = (r: Partial<UsageLogRow>): UsageLogRow => ({
  created_at: "2026-11-22T10:00:00Z",
  feature: "video",
  model: "Gemini 4 Hydrogen",
  status: 200,
  ok: true,
  ms: 60_000,
  input_tokens: 1000,
  output_tokens: 200,
  handed_off: false,
  ...r,
});

describe("AI usage stats", () => {
  it("counts answers, failures and hand-offs separately", () => {
    const stats = summarise([
      row({ ok: false, status: 429, handed_off: true, input_tokens: 0, output_tokens: 0, ms: 1000 }),
      row({ model: "Gemini 3.8 Flash", ms: 30_000 }),
      row({ feature: "category", ms: 90_000 }),
      row({ ok: false, status: 504, input_tokens: 0, output_tokens: 0, ms: 285_000 }),
    ]);
    expect(stats.total).toMatchObject({ answers: 2, failures: 1, handoffs: 1, limitHits: 1, timeouts: 1, tokens: 2400, avgMs: 60_000 });
    expect(stats.successRate).toBeCloseTo(2 / 3);
    const hydrogen = stats.byModel.find((g) => g.name === "Gemini 4 Hydrogen")!;
    expect(hydrogen).toMatchObject({ answers: 1, failures: 1, handoffs: 1 });
    expect(stats.byFeature.map((g) => g.name)).toEqual(["Videos: Ask AI and summaries", "Ask this category"]);
  });

  it("has no success rate before anything finished", () => {
    expect(summarise([]).successRate).toBeNull();
  });

  it("says what happened in words", () => {
    expect(outcome({ ok: true, status: 200, handed_off: false })).toBe("Answered");
    expect(outcome({ ok: false, status: 429, handed_off: true })).toBe("Free limit used up, next model asked");
    expect(outcome({ ok: false, status: 504, handed_off: false })).toBe("Too slow");
  });

  it("formats times and token counts", () => {
    expect(formatDuration(65_000)).toBe("1:05");
    expect(formatTokens(950)).toBe("950");
    expect(formatTokens(12_300)).toBe("12K");
    expect(formatTokens(2_450_000)).toBe("2.45M");
  });
});
