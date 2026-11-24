// Bandwidth: how much data BrainShelf sends each month, from Supabase (database, files, sign-in)
// and from Vercel (the app's pages and scripts). Neither lets an app read its own bandwidth, so
// each signed-in browser counts what it downloads and adds it to public.bandwidth_usage
// (supabase/bandwidth.sql) every minute or so. The page then shows this month's total against
// each free plan's limit, and the count starts again on the 1st of each month.

// Supabase's free plan: 5 GB of egress a month. Vercel's Hobby plan: 100 GB of Fast Data Transfer.
export const FREE_SUPABASE_BYTES = 5 * 1024 * 1024 * 1024;
export const FREE_VERCEL_BYTES = 100 * 1024 * 1024 * 1024;

export type BandwidthSource = "supabase" | "vercel";

export type BandwidthStats = {
  // First day of this month, like "2026-11-01".
  month: string;
  rows: { month: string; source: BandwidthSource; bytes: number; requests: number; my_bytes: number; people: number }[];
};

export type Totals = { bytes: number; requests: number; myBytes: number; people: number };

const EMPTY: Totals = { bytes: 0, requests: 0, myBytes: 0, people: 0 };

// This month's and last month's totals for one source.
export function totalsFor(stats: BandwidthStats, source: BandwidthSource) {
  const last = previousMonth(stats.month);
  const pick = (month: string): Totals => {
    const r = stats.rows.find((row) => row.source === source && row.month === month);
    return r ? { bytes: Number(r.bytes), requests: Number(r.requests), myBytes: Number(r.my_bytes), people: r.people } : EMPTY;
  };
  return { now: pick(stats.month), last: pick(last) };
}

export function previousMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, "0")}-01`;
}

// The day the count starts again, and how many days away it is.
export function nextReset(now: Date = new Date()) {
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const days = Math.max(1, Math.ceil((reset.getTime() - now.getTime()) / 86_400_000));
  return { reset, days };
}

// How this month is going: at the current pace, what the whole month will come to.
export function projectedForMonth(used: number, now: Date = new Date()) {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  const elapsed = Math.max(now.getTime() - start, 3_600_000);
  return Math.round((used / elapsed) * (end - start));
}

export function monthName(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString(undefined, { month: "long", timeZone: "UTC" });
}

// ---- Counting, in the browser ----

const pending = { supabase: 0, supabaseRequests: 0, vercel: 0, vercelRequests: 0 };

export function takePending() {
  const taken = { ...pending };
  pending.supabase = pending.supabaseRequests = pending.vercel = pending.vercelRequests = 0;
  return taken;
}

export function hasPending() {
  return pending.supabaseRequests + pending.vercelRequests > 0;
}

export function addBytes(source: BandwidthSource, bytes: number) {
  if (source === "supabase") {
    pending.supabase += bytes;
    pending.supabaseRequests += 1;
  } else {
    pending.vercel += bytes;
    pending.vercelRequests += 1;
  }
}

// The report itself isn't counted, so a quiet tab doesn't keep reporting its own reports.
const REPORT_PATH = "/rest/v1/rpc/add_bandwidth";

// Size of a response as it came over the network: the Content-Length when the server sends one,
// otherwise the size of the body once read (a little high when it was compressed).
export async function responseBytes(response: Response) {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > 0) return length;
  if (!response.body) return 0;
  try {
    return (await response.clone().arrayBuffer()).byteLength;
  } catch {
    return 0;
  }
}

// fetch for the Supabase browser client: works the same, and counts each answer's size.
export const countingFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes(REPORT_PATH)) {
    responseBytes(response).then((bytes) => addBytes("supabase", bytes));
  }
  return response;
};
