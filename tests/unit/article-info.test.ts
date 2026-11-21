import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/require-user", () => ({ isSignedIn: async () => true }));
const page = vi.hoisted(() => ({ html: "" }));
vi.mock("@/lib/fetch-page", () => ({ fetchPage: async () => page.html }));

import { GET } from "@/app/api/article-info/route";

async function info(html: string) {
  page.html = html;
  const res = await GET(new Request("http://localhost/api/article-info?url=https://www.example.com/post"));
  return res.json();
}

afterEach(() => {
  page.html = "";
});

describe("article-info", () => {
  it("finds the author in schema.org data, skipping profile links", async () => {
    const data = await info(`<html><head><title>T</title>
      <meta property="article:author" content="https://facebook.com/someone">
      <script type="application/ld+json">{"@graph":[{"@type":"NewsArticle","author":[{"@type":"Person","name":"Jane Doe"}],"publisher":{"name":"The Daily"}}]}</script>
      </head></html>`);
    expect(data.author).toBe("Jane Doe");
    expect(data.publisher).toBe("The Daily");
  });

  it("uses the site name as the company when no author is listed", async () => {
    const data = await info(`<html><head><title>T</title><meta property="og:site_name" content="Acme Labs"></head></html>`);
    expect(data.author).toBeNull();
    expect(data.publisher).toBe("Acme Labs");
    expect(data.site).toBe("example.com");
  });
});
