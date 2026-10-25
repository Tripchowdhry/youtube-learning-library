// Helpers for links saved in the Reading section.

export function parseLink(input: string): URL | null {
  const text = input.trim();
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

const X_HOSTS = new Set(["x.com", "twitter.com", "mobile.twitter.com", "mobile.x.com"]);

// The post id from an X (Twitter) link like x.com/name/status/123, or null.
export function xPostId(url: URL): string | null {
  if (!X_HOSTS.has(url.hostname.replace(/^www\./, ""))) return null;
  const match = url.pathname.match(/\/status(?:es)?\/(\d+)/);
  return match ? match[1] : null;
}

// A short site name for the list, like "x.com" or "medium.com".
export function siteName(url: URL): string {
  const host = url.hostname.replace(/^www\./, "");
  return host === "twitter.com" ? "x.com" : host;
}
