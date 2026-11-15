import { describe, expect, it } from "vitest";
import { fetchAll } from "@/lib/fetch-all";

// A fake table of `total` rows, answered 1,000 at a time like the real database.
const table = (total: number) => {
  const asked: string[] = [];
  const page = async (from: number, to: number) => {
    asked.push(`${from}-${to}`);
    const data = Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => from + i);
    return { data, error: null };
  };
  return { page, asked };
};

describe("fetchAll", () => {
  it.each([0, 5, 999, 1000, 1001, 2500])("reads all %i rows, each once", async (total) => {
    const { page } = table(total);
    const { data, error } = await fetchAll(page);
    expect(error).toBeNull();
    expect(data).toHaveLength(total);
    expect(new Set(data).size).toBe(total);
  });

  it("asks only as many times as needed", async () => {
    const { page, asked } = table(2500);
    await fetchAll(page);
    expect(asked).toEqual(["0-999", "1000-1999", "2000-2999"]);
  });

  it("stops and reports an error part way through", async () => {
    const error = { message: "boom", details: "", hint: "", code: "" } as never;
    const result = await fetchAll(async (from) => (from === 0 ? { data: Array(1000).fill(1), error: null } : { data: null, error }));
    expect(result).toEqual({ data: null, error });
  });
});
