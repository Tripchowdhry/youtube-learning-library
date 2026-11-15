import { describe, expect, it } from "vitest";
import { isPublicHost } from "@/lib/fetch-page";

// Links people save are fetched by the server, so it must never be pointed at private addresses.
describe("isPublicHost", () => {
  it.each(["example.com", "news.ycombinator.com", "8.8.8.8"])("allows %s", (host) => expect(isPublicHost(host)).toBe(true));
  it.each([
    "localhost",
    "api.localhost",
    "metadata.google.internal",
    "printer.local",
    "127.0.0.1",
    "10.0.0.5",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "[::1]",
  ])("blocks %s", (host) => expect(isPublicHost(host)).toBe(false));

  it("blocks private addresses written in odd ways once the browser tidies them", () => {
    expect(isPublicHost(new URL("http://0x7f.1/").hostname)).toBe(false);
    expect(isPublicHost(new URL("http://2130706433/").hostname)).toBe(false);
  });
});
