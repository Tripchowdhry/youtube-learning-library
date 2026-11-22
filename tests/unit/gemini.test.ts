import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { askAboutSources, askAboutVideo, withModelAttempt, type UsageRow } from "@/lib/gemini";
import { forgetModelList, orderModels } from "@/lib/gemini-models";

type Reply = { status: number; body: unknown };

let listCalls = 0;

// Answers each Gemini call by model name, and records what was asked. `listed` is Google's
// list of models (null: the list can't be read).
function fakeGoogle(answer: (model: string, body: Record<string, unknown>) => Reply, listed: string[] | null = null) {
  const calls: { model: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { body: string }) => {
      if (url.includes("/models?")) {
        listCalls++;
        if (!listed) return new Response("{}", { status: 500 });
        const models = listed.map((m) => ({ name: `models/${m}`, supportedGenerationMethods: ["generateContent"] }));
        return new Response(JSON.stringify({ models }), { status: 200 });
      }
      const model = url.match(/models\/([^:]+):/)![1];
      const body = JSON.parse(init.body);
      calls.push({ model, body });
      const { status, body: out } = answer(model, body);
      return new Response(JSON.stringify(out), { status });
    }),
  );
  return calls;
}

const ok = (text: string) => ({ status: 200, body: { candidates: [{ content: { parts: [{ text }] } }] } });
const fail = (status: number, message: string) => ({ status, body: { error: { message } } });

beforeEach(() => {
  forgetModelList();
  listCalls = 0;
  vi.stubEnv("GEMINI_API_KEY", "test");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("askAboutVideo", () => {
  it("never asks for a retired model", async () => {
    const calls = fakeGoogle(() => fail(404, "not found"));
    await expect(askAboutVideo("https://youtu.be/x", "be brief", "summarise")).rejects.toThrow();
    const asked = calls.map((c) => c.model);
    expect(asked).toContain("gemini-4-hydrogen");
    expect(asked).toContain("gemini-3.5-flash-lite");
    for (const gone of ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-3.6-flash"]) expect(asked).not.toContain(gone);
  });

  it("drops the extra settings when a model turns them down", async () => {
    fakeGoogle((model, body) => (model === "gemini-4-hydrogen" && body.generationConfig ? fail(400, "bad field") : ok("summary")));
    await expect(askAboutVideo("https://youtu.be/x", "be brief", "summarise")).resolves.toMatchObject({ text: "summary" });
  });

  it("says the free limit is used up even when a backup fails for another reason", async () => {
    fakeGoogle((model) => (model === "gemini-4-hydrogen" ? fail(429, "quota") : fail(404, "model is no longer available")));
    await expect(askAboutVideo("https://youtu.be/x", "be brief", "summarise")).rejects.toThrow(/free AI limit/);
  });

  it("explains the main model's failure, not a missing backup's", async () => {
    fakeGoogle((model) => (model === "gemini-4-hydrogen" ? fail(400, "video too long") : fail(404, "no longer available")));
    await expect(askAboutVideo("https://youtu.be/x", "be brief", "summarise")).rejects.toThrow(/Gemini 4 Hydrogen: video too long/);
  });
});

describe("Gemini's own model list", () => {
  it("asks only for models Google still offers, and adds a new one after the usual ones", async () => {
    const listed = ["gemini-4-hydrogen", "gemini-3.5-flash-lite", "gemini-5-flash", "gemini-5-flash-preview-11-2026", "gemini-embedding-001"];
    const calls = fakeGoogle(() => fail(503, "busy"), listed);
    await expect(askAboutVideo("https://youtu.be/x", "be brief", "summarise")).rejects.toThrow(/busy/);
    expect(unique(calls.map((c) => c.model))).toEqual([
      "gemini-4-hydrogen",
      "gemini-flash-latest",
      "gemini-3.5-flash-lite",
      "gemini-flash-lite-latest",
      "gemini-5-flash",
    ]);
  });

  it("reads the list once, not on every request", async () => {
    fakeGoogle(() => ok("summary"), ["gemini-4-hydrogen"]);
    await askAboutVideo("https://youtu.be/x", "be brief", "summarise");
    await askAboutVideo("https://youtu.be/y", "be brief", "summarise");
    await askAboutVideo("https://youtu.be/z", "be brief", "summarise");
    expect(listCalls).toBe(1);
  });

  it("uses the fixed list when Google's list can't be read", async () => {
    const calls = fakeGoogle((model) => (model === "gemini-flash-latest" ? ok("summary") : fail(503, "busy")), null);
    await expect(askAboutVideo("https://youtu.be/x", "be brief", "summarise")).resolves.toMatchObject({ text: "summary" });
    expect(unique(calls.map((c) => c.model))).toEqual(["gemini-4-hydrogen", "gemini-3.8-flash", "gemini-flash-latest"]);
  });

  it("skips a model retired during the day and gets a fresh list", async () => {
    const calls = fakeGoogle((model) => (model === "gemini-4-hydrogen" ? fail(404, "model is no longer available") : ok("summary")), [
      "gemini-4-hydrogen",
      "gemini-3.8-flash",
    ]);
    await expect(askAboutVideo("https://youtu.be/x", "be brief", "summarise")).resolves.toMatchObject({ text: "summary" });
    expect(listCalls).toBe(1);
    calls.length = 0;
    await expect(askAboutVideo("https://youtu.be/y", "be brief", "summarise")).resolves.toMatchObject({ text: "summary" });
    expect(calls.map((c) => c.model)[0]).toBe("gemini-3.8-flash");
    expect(calls.map((c) => c.model)).not.toContain("gemini-4-hydrogen");
    expect(listCalls).toBe(2);
  });

  it("puts a chosen GEMINI_MODEL first", () => {
    vi.stubEnv("GEMINI_MODEL", "gemini-special");
    expect(orderModels(new Set(["gemini-3.8-flash"]))[0]).toBe("gemini-special");
    expect(orderModels(null)[0]).toBe("gemini-special");
  });
});

function unique(list: string[]) {
  return list.filter((m, i) => list.indexOf(m) === i);
}

describe("askAboutSources", () => {
  it("sends every video and text in one request, watching videos lightly", async () => {
    const calls = fakeGoogle(() => ok("An answer [1]"), ["gemini-4-hydrogen"]);
    const { text } = await askAboutSources(
      [{ text: "Source [1]" }, { video: "https://www.youtube.com/watch?v=abc" }, { text: "Source [2]" }],
      "Answer from the sources.",
      "Question: why?",
    );
    expect(text).toBe("An answer [1]");
    const body = calls[0].body as { contents: { parts: Record<string, unknown>[] }[]; generationConfig?: unknown };
    const parts = body.contents[0].parts;
    expect(parts).toHaveLength(4);
    expect(parts[1]).toEqual({ file_data: { file_uri: "https://www.youtube.com/watch?v=abc" }, video_metadata: { fps: 0.1 } });
    expect(parts[3]).toEqual({ text: "Question: why?" });
    expect(body.generationConfig).toEqual({ mediaResolution: "MEDIA_RESOLUTION_LOW" });
  });
});

describe("AI usage log", () => {
  it("logs each model asked, with its time, tokens and whether the next one was tried", async () => {
    fakeGoogle((model) => (model === "gemini-4-hydrogen" ? fail(429, "quota") : ok("hi")), ["gemini-4-hydrogen", "gemini-3.8-flash"]);
    const usage: UsageRow[] = [];
    await withModelAttempt(0, () => askAboutVideo("https://youtu.be/x", "i", "r"), usage, "video").catch(() => null);
    await withModelAttempt(1, () => askAboutVideo("https://youtu.be/x", "i", "r"), usage, "video");
    expect(usage.map((row) => ({ ...row, ms: 0 }))).toEqual([
      { feature: "video", model: "Gemini 4 Hydrogen", status: 429, ok: false, ms: 0, input_tokens: 0, output_tokens: 0, handed_off: true },
      { feature: "video", model: "Gemini 3.8 Flash", status: 200, ok: true, ms: 0, input_tokens: 0, output_tokens: 0, handed_off: false },
    ]);
  });
});

describe("one model at a time", () => {
  it("asks only the model for this attempt and says when another one is worth trying", async () => {
    const calls = fakeGoogle(() => fail(429, "quota"), ["gemini-4-hydrogen", "gemini-3.8-flash"]);
    const first = await withModelAttempt(0, () => askAboutVideo("https://youtu.be/x", "i", "r")).catch((e) => e);
    expect(new Set(calls.map((c) => c.model))).toEqual(new Set(["gemini-4-hydrogen"]));
    expect(first.status).toBe(429);
    expect(first.tryNext).toBe(true);

    calls.length = 0;
    const second = await withModelAttempt(1, () => askAboutVideo("https://youtu.be/x", "i", "r")).catch((e) => e);
    expect(new Set(calls.map((c) => c.model))).toEqual(new Set(["gemini-3.8-flash"]));
    expect(second.tryNext).toBe(true);

    // The list is hydrogen, 3.8 Flash and the two "-latest" names: the last one has no next.
    const last = await withModelAttempt(3, () => askAboutVideo("https://youtu.be/x", "i", "r")).catch((e) => e);
    expect(last.tryNext).toBe(false);
    const past = await withModelAttempt(4, () => askAboutVideo("https://youtu.be/x", "i", "r")).catch((e) => e);
    expect(past.status).toBe(503);
  });

  it("moves on from a model that runs out of time", async () => {
    const models: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/models?")) return new Response("{}", { status: 500 });
        const model = url.match(/models\/([^:]+):/)![1];
        models.push(model);
        if (models.length === 1) throw new DOMException("timed out", "TimeoutError");
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }), { status: 200 });
      }),
    );
    const { text } = await askAboutVideo("https://youtu.be/x", "i", "r");
    expect(text).toBe("ok");
    expect(models.length).toBe(2);
    expect(models[0]).not.toBe(models[1]);
  });
});
