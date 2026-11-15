import { describe, expect, it } from "vitest";
import { friendlyError } from "@/lib/errors";

describe("friendlyError", () => {
  it.each([
    ["TypeError: Failed to fetch", /internet connection/],
    ["Load failed", /internet connection/],
    ["JWT expired", /signed out/],
    ['new row violates row-level security policy for table "videos"', /couldn't save/],
    ['duplicate key value violates unique constraint "videos_pkey"', /already saved/],
    ['invalid input syntax for type uuid: "x"', /Something went wrong/],
    ["", /Something went wrong/],
  ])("turns %j into plain words", (raw, plain) => expect(friendlyError(raw)).toMatch(plain));

  it("keeps the app's own sentences as they are", () => {
    const own = "Files can't be added yet. In Supabase, open SQL Editor and run the file supabase/files.sql once, then reload.";
    expect(friendlyError(own)).toBe(own);
    expect(friendlyError("A file couldn't be added.")).toBe("A file couldn't be added.");
  });
});
