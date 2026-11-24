import { describe, expect, it } from "vitest";
import { highlightRanges, matches, notesText, prepare, queryWords, rank, whereFound } from "@/lib/search";

const find = (query: string, fields: { label: string; text: string }[]) => matches(prepare(fields), queryWords(query));

describe("search", () => {
  it("finds every word in any order and any field", () => {
    const item = [
      { label: "Title", text: "Hooks in React" },
      { label: "Notes", text: "useEffect runs after render" },
    ];
    expect(find("react hooks", item)).toBe(true);
    expect(find("react render", item)).toBe(true);
    expect(find("react vue", item)).toBe(false);
  });

  it("ignores capitals, accents and simple plurals", () => {
    expect(find("cafe", [{ label: "Title", text: "Le Café" }])).toBe(true);
    expect(find("story", [{ label: "Title", text: "Bedtime stories" }])).toBe(true);
    expect(find("stories", [{ label: "Title", text: "One story" }])).toBe(true);
    expect(find("boxes", [{ label: "Title", text: "a box" }])).toBe(true);
    expect(find("hook", [{ label: "Title", text: "hooks, explained" }])).toBe(true);
  });

  it("keeps the old part-of-a-word matching", () => {
    expect(find("react", [{ label: "Title", text: "ReactJS crash course" }])).toBe(true);
  });

  it("looks for symbols as typed", () => {
    expect(find("c++", [{ label: "Title", text: "Learn C++ fast" }])).toBe(true);
    expect(find("c++", [{ label: "Title", text: "Learn cooking" }])).toBe(false);
  });

  it("keeps quoted words together", () => {
    const item = [{ label: "Title", text: "machine learning for kids" }];
    expect(find('"machine learning"', item)).toBe(true);
    expect(find('"learning machine"', item)).toBe(false);
  });

  it("says where a match came from when the title doesn't explain it", () => {
    const index = prepare([
      { label: "Title", text: "Hooks in React" },
      { label: "Notes", text: "Remember: useEffect runs after every render unless you pass dependencies." },
    ]);
    expect(whereFound(index, queryWords("react"))).toBeNull();
    expect(whereFound(index, queryWords("react dependencies"))?.label).toBe("Notes");
  });

  it("highlights words and their plurals", () => {
    expect(highlightRanges("Bedtime Stories", queryWords("story"))).toEqual([[8, 15]]);
    expect(highlightRanges("Le Café", queryWords("cafe"))).toEqual([[3, 7]]);
  });

  it("reads typed notes without formatting or clips", () => {
    const saved = "**✨ Summary**\n- point one\n\n--- clips ---\n[1:00] ![clip](a/b.webm)";
    expect(notesText(saved)).toBe("✨ Summary · point one");
  });
});

describe("rank", () => {
  it("puts title matches before matches in the notes", () => {
    const words = queryWords("react");
    const inTitle = prepare([{ label: "Title", text: "React basics" }]);
    const inNotes = prepare([
      { label: "Title", text: "Web speed" },
      { label: "your notes", text: "React apps send too much" },
    ]);
    expect(rank(inTitle, words)).toBeGreaterThan(rank(inNotes, words));
  });
});

describe("cleanAiTags", () => {
  it("tidies the AI's answer and reuses existing tags", async () => {
    const { cleanAiTags } = await import("@/lib/ai-tags");
    expect(cleanAiTags("#React, Web Performance,  react , 'css'\n- tags", ["JavaScript", "React"])).toEqual(["React", "web performance", "css"]);
    expect(cleanAiTags("a, b, c, d")).toEqual(["a", "b", "c"]);
  });
});
