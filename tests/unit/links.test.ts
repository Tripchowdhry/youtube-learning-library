import { describe, expect, it } from "vitest";
import { cleanLink, fileViewLink, linkKey, parseLink, siteName, xPostId } from "@/lib/links";

describe("linkKey: the same page saved twice is spotted", () => {
  it("ignores www, trailing slashes, anchors and tracking", () => {
    expect(linkKey("https://www.example.com/post/?utm_source=x#top")).toBe(linkKey("example.com/post"));
  });
  it("keeps real query parameters, in any order", () => {
    expect(linkKey("example.com/a?b=2&a=1")).toBe(linkKey("example.com/a?a=1&b=2"));
    expect(linkKey("example.com/a?page=2")).not.toBe(linkKey("example.com/a?page=3"));
  });
  it("matches x.com and twitter.com posts by id", () => {
    expect(linkKey("https://twitter.com/someone/status/123?s=20")).toBe(linkKey("https://x.com/other/status/123"));
  });
  it("returns null for something that isn't a link", () => {
    expect(linkKey("not a link at all")).toBeNull();
  });
});

describe("parseLink", () => {
  it("adds https:// when it's missing", () => expect(parseLink("example.com")?.href).toBe("https://example.com/"));
  it("refuses other kinds of links", () => expect(parseLink("javascript:alert(1)")).toBeNull());
});

describe("cleanLink", () => {
  it("drops tracking and X share codes", () => {
    expect(cleanLink(new URL("https://example.com/a?utm_medium=x&id=5#h"))).toBe("https://example.com/a?id=5");
    expect(cleanLink(new URL("https://x.com/a/status/9?s=20&t=abc"))).toBe("https://x.com/a/status/9");
  });
});

describe("small helpers", () => {
  it("names the site", () => {
    expect(siteName(new URL("https://www.twitter.com/a"))).toBe("x.com");
    expect(siteName(new URL("https://medium.com/a"))).toBe("medium.com");
  });
  it("reads X post ids", () => expect(xPostId(new URL("https://mobile.x.com/a/statuses/77"))).toBe("77"));
  it("turns shared PDFs into viewable links", () => {
    expect(fileViewLink("https://drive.google.com/file/d/abc123/view")).toBe("https://drive.google.com/file/d/abc123/preview");
    expect(fileViewLink("https://www.dropbox.com/s/xyz/file.pdf?dl=0")).toContain("raw=1");
    expect(fileViewLink("https://example.com/paper.pdf")).toBe("https://example.com/paper.pdf");
    expect(fileViewLink("https://example.com/page")).toBeNull();
  });
});
