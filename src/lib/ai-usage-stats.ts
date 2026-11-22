// Sums up the AI usage log (supabase/ai-usage.sql) for the AI usage page. One row is one AI
// model asked: a request that hands off from one model to the next has a row for each.

export type UsageLogRow = {
  created_at: string;
  feature: string;
  model: string;
  status: number;
  ok: boolean;
  ms: number;
  input_tokens: number;
  output_tokens: number;
  handed_off: boolean;
};

export const FEATURES: Record<string, string> = {
  video: "Videos: Ask AI and summaries",
  article: "Reading and Tutorials",
  file: "ScrapBook files",
  category: "Ask this category",
  report: "Report Writer",
  improve: "Improve writing",
  handwriting: "Reading handwriting",
};

export const featureName = (feature: string) => FEATURES[feature] ?? feature;

// What happened, in words.
export function outcome(row: Pick<UsageLogRow, "ok" | "status" | "handed_off">) {
  if (row.ok) return "Answered";
  const why =
    row.status === 429 ? "Free limit used up" : row.status === 504 ? "Too slow" : row.status === 503 || row.status === 500 ? "Busy" : `Failed (${row.status})`;
  return row.handed_off ? `${why}, next model asked` : why;
}

export type Group = {
  name: string;
  answers: number;
  // Requests that ended without an answer (not counting a model that handed off).
  failures: number;
  handoffs: number;
  limitHits: number;
  timeouts: number;
  tokens: number;
  // Average time to an answer, in milliseconds.
  avgMs: number;
};

function group(name: string, rows: UsageLogRow[]): Group {
  const answered = rows.filter((r) => r.ok);
  return {
    name,
    answers: answered.length,
    failures: rows.filter((r) => !r.ok && !r.handed_off).length,
    handoffs: rows.filter((r) => r.handed_off).length,
    limitHits: rows.filter((r) => r.status === 429).length,
    timeouts: rows.filter((r) => r.status === 504).length,
    tokens: rows.reduce((t, r) => t + r.input_tokens + r.output_tokens, 0),
    avgMs: answered.length ? Math.round(answered.reduce((t, r) => t + r.ms, 0) / answered.length) : 0,
  };
}

function groupBy(rows: UsageLogRow[], key: (r: UsageLogRow) => string) {
  const map = new Map<string, UsageLogRow[]>();
  for (const r of rows) map.set(key(r), [...(map.get(key(r)) ?? []), r]);
  return [...map].map(([name, list]) => group(name, list)).sort((a, b) => b.answers + b.failures + b.handoffs - (a.answers + a.failures + a.handoffs));
}

export function summarise(rows: UsageLogRow[]) {
  const total = group("All", rows);
  const finished = total.answers + total.failures;
  return {
    total,
    // Of the requests that finished, how many got an answer.
    successRate: finished ? total.answers / finished : null,
    inputTokens: rows.reduce((t, r) => t + r.input_tokens, 0),
    outputTokens: rows.reduce((t, r) => t + r.output_tokens, 0),
    byModel: groupBy(rows, (r) => r.model),
    byFeature: groupBy(rows, (r) => featureName(r.feature)),
  };
}

// 1:05 for 65 seconds; 0:03 for 3.
export function formatDuration(ms: number) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// 12,300 → "12.3K"; 2,450,000 → "2.45M".
export function formatTokens(n: number) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}
