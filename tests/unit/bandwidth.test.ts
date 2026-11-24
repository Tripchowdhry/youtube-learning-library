import { describe, expect, it } from "vitest";
import { nextReset, previousMonth, projectedForMonth, responseBytes, totalsFor, type BandwidthStats } from "@/lib/bandwidth";

describe("bandwidth", () => {
  it("starts again on the 1st of next month", () => {
    const { reset, days } = nextReset(new Date("2026-11-24T19:00:00Z"));
    expect(reset.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(days).toBe(7);
    expect(nextReset(new Date("2026-12-31T12:00:00Z")).reset.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("knows last month, across a new year too", () => {
    expect(previousMonth("2026-11-01")).toBe("2026-10-01");
    expect(previousMonth("2027-01-01")).toBe("2026-12-01");
  });

  it("projects the month from the pace so far", () => {
    // Halfway through a 30-day month.
    expect(projectedForMonth(1000, new Date("2026-11-16T00:00:00Z"))).toBe(2000);
  });

  it("picks this month and last month for each source", () => {
    const stats: BandwidthStats = {
      month: "2026-11-01",
      rows: [
        { month: "2026-11-01", source: "supabase", bytes: 500, requests: 10, my_bytes: 200, people: 2 },
        { month: "2026-10-01", source: "supabase", bytes: 900, requests: 30, my_bytes: 900, people: 1 },
      ],
    };
    expect(totalsFor(stats, "supabase")).toEqual({
      now: { bytes: 500, requests: 10, myBytes: 200, people: 2 },
      last: { bytes: 900, requests: 30, myBytes: 900, people: 1 },
    });
    expect(totalsFor(stats, "vercel").now.bytes).toBe(0);
  });

  it("measures an answer by its Content-Length, or its body when there isn't one", async () => {
    expect(await responseBytes(new Response("hello", { headers: { "content-length": "1234" } }))).toBe(1234);
    expect(await responseBytes(new Response("hello"))).toBe(5);
  });
});
