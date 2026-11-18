import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { askAboutVideo } from "@/lib/gemini";

type Reply = { status: number; body: unknown };

// Answers each Gemini call by model name, and records what was asked.
function fakeGoogle(answer: (model: string, body: Record<string, unknown>) => Reply) {
  const calls: { model: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { body: string }) => {
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
  vi.stubEnv("GEMINI_API_KEY", "test");
  vi.spyOn(console, "error").mockImplementation(() => {});
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
