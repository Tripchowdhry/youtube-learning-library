import { describe, expect, it } from "vitest";
import { bucketName, formatBytes, percentOf, tableName } from "@/lib/storage-stats";

describe("storage stats", () => {
  it("writes sizes the way people read them", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(20 * 1024)).toBe("20 KB");
    expect(formatBytes(3.5 * 1024 * 1024)).toBe("3.5 MB");
    expect(formatBytes(42 * 1024 * 1024)).toBe("42 MB");
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe("2.00 GB");
  });

  it("shows at least 1% once anything is used", () => {
    expect(percentOf(0, 100)).toBe(0);
    expect(percentOf(1, 1000)).toBe(1);
    expect(percentOf(250, 500)).toBe(50);
  });

  it("names tables and buckets in plain words", () => {
    expect(tableName("article_texts")).toBe("Saved article text");
    expect(tableName("some_new_table")).toBe("Some new table");
    expect(bucketName("clips")).toBe("Video clips");
  });
});
