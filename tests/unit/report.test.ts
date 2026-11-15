import { describe, expect, it } from "vitest";
import { fileName, parseInline, parseReport } from "@/lib/report";

describe("parseReport", () => {
  it("reads headings, lists, quotes, numbers and pictures", () => {
    const blocks = parseReport("# Title\n\n## Part\n- one\n2. two\n> said\n![A chart](https://x.com/c.png)\n[1:05] ![clip](u1/p.png)\nPlain text");
    expect(blocks.map((b) => b.type)).toEqual(["h1", "h2", "li", "ol", "quote", "img", "img", "p"]);
    expect(blocks[5]).toEqual({ type: "img", src: "https://x.com/c.png", caption: "A chart" });
    expect(blocks[6]).toEqual({ type: "img", src: "u1/p.png", caption: "At 1:05" });
  });
});

describe("parseInline", () => {
  it("reads bold, italic, underline and links, also inside each other", () => {
    expect(parseInline("a **b** *c* ++d++ [e **f**](https://e.com)")).toEqual([
      { text: "a " },
      { text: "b", bold: true },
      { text: " " },
      { text: "c", italic: true },
      { text: " " },
      { text: "d", underline: true },
      { text: " " },
      { text: "e ", href: "https://e.com" },
      { text: "f", href: "https://e.com", bold: true },
    ]);
  });
  it("leaves snake_case words alone", () => expect(parseInline("my_var_name")).toEqual([{ text: "my_var_name" }]));
});

describe("fileName", () => {
  it("makes a safe download name", () => {
    expect(fileName('What: "AI"/ML?')).toBe("What AI ML");
    expect(fileName("   ")).toBe("Report");
  });
});
