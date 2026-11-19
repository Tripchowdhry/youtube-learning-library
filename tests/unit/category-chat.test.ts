import { describe, expect, it } from "vitest";
import { answerAsHtml, answerAsText, citedSources, parseLine, parseTime, sourceHref, type ChatSource } from "@/lib/category-chat";

const sources: ChatSource[] = [
  { n: 1, kind: "video", id: "a", title: "Neural networks" },
  { n: 2, kind: "video", id: "b", title: "Gradient descent" },
  { n: 3, kind: "video", id: "c", title: "Backprop" },
];

describe("Ask this category answers", () => {
  it("reads video times", () => {
    expect(parseTime("4:12")).toBe(252);
    expect(parseTime("1:02:30")).toBe(3750);
    expect(parseTime("abc")).toBeNull();
  });

  it("finds citations, with and without a time, and several in one bracket", () => {
    const segs = parseLine("It guesses [1 @ 0:40] and checks [2], then nudges [1, 3 @ 2:05].", 3);
    expect(segs.filter((s) => s.type === "cite")).toEqual([
      { type: "cite", n: 1, t: 40 },
      { type: "cite", n: 2, t: null },
      { type: "cite", n: 1, t: null },
      { type: "cite", n: 3, t: 125 },
    ]);
  });

  it("drops citations to sources that don't exist and keeps bold text", () => {
    const segs = parseLine("A **key** idea [7]", 3);
    expect(segs).toEqual([
      { type: "text", text: "A ", bold: false },
      { type: "text", text: "key", bold: true },
      { type: "text", text: " idea", bold: false },
    ]);
  });

  it("lists only cited sources, with the first time given", () => {
    const cited = citedSources("One [2].\n- Two [2 @ 6:40] and [1]", sources);
    expect(cited.map((s) => [s.n, s.t])).toEqual([
      [1, null],
      [2, 400],
    ]);
  });

  it("links videos to the cited moment", () => {
    expect(sourceHref({ kind: "video", id: "a" }, 252)).toBe("/video/a?t=252");
    expect(sourceHref({ kind: "article", id: "x" })).toBe("/read/x");
    expect(sourceHref({ kind: "scrap", id: "y" })).toBe("/scrap/y");
  });

  it("writes sources out in words for copying and saving", () => {
    expect(answerAsText("It learns [2 @ 6:40].", sources)).toBe("It learns (Gradient descent, 6:40).");
    expect(answerAsHtml("How?", "- A <b> [1]", sources)).toBe("<p><em>How?</em></p><ul><li>A &lt;b&gt; (Neural networks)</li></ul>");
  });
});
