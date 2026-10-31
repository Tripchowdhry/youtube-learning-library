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

const TRACKING_PARAMS = /^(utm_\w+|fbclid|gclid|mc_cid|mc_eid|ref|ref_src|ref_url|igshid|si)$/i;

// A key that's the same for two links to the same page, so a link saved once
// isn't saved again: x.com and twitter.com posts match by post id, and
// "www.", a trailing slash, #anchors and tracking bits like ?utm_source= are ignored.
export function linkKey(input: string): string | null {
  const url = parseLink(input);
  if (!url) return null;
  const postId = xPostId(url);
  if (postId) return `x:${postId}`;
  const params = [...url.searchParams].filter(([k]) => !TRACKING_PARAMS.test(k)).sort(([a], [b]) => a.localeCompare(b));
  const query = params.length ? `?${new URLSearchParams(params)}` : "";
  return `${url.hostname.replace(/^www\./, "").toLowerCase()}${url.pathname.replace(/\/+$/, "")}${query}`;
}

// The link to save: tracking bits and X's share codes (?s=20&t=...) removed.
export function cleanLink(url: URL): string {
  const clean = new URL(url.href);
  clean.hash = "";
  if (xPostId(clean)) clean.search = "";
  else for (const key of [...clean.searchParams.keys()]) if (TRACKING_PARAMS.test(key)) clean.searchParams.delete(key);
  return clean.href;
}

// A link that shows a shared PDF inside the reading page: Dropbox's raw view, Google Drive's
// preview, or a plain .pdf link. Null for other links.
export function fileViewLink(input: string): string | null {
  const url = parseLink(input);
  if (!url) return null;
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (host === "dropbox.com" && /^\/(s|scl\/fi)\//.test(url.pathname)) {
    const view = new URL(url.href);
    view.searchParams.delete("dl");
    view.searchParams.set("raw", "1");
    return view.href;
  }
  if (host === "drive.google.com") {
    const id = url.pathname.match(/\/file\/d\/([\w-]+)/)?.[1] ?? url.searchParams.get("id");
    if (id) return `https://drive.google.com/file/d/${id}/preview`;
  }
  return /\.pdf$/i.test(url.pathname) ? url.href : null;
}
