// How much room BrainShelf takes in Supabase, as public.storage_stats() reports it
// (supabase/storage-stats.sql).

export type StorageStats = {
  database_bytes: number;
  tables: { name: string; bytes: number; rows: number }[];
  files: { bucket: string; count: number; bytes: number }[];
};

// Supabase's free plan: 500 MB of database and 1 GB of file storage.
export const FREE_DATABASE_BYTES = 500 * 1024 * 1024;
export const FREE_FILE_BYTES = 1024 * 1024 * 1024;

const TABLES: Record<string, string> = {
  videos: "Videos",
  notes: "Video notes",
  video_categories: "Video categories",
  articles: "Reading and tutorials",
  article_texts: "Saved article text",
  article_categories: "Reading categories",
  scraps: "ScrapBook",
  reports: "Reports",
  report_sources: "Report sources",
  vault_entries: "Vault",
  vault_categories: "Vault categories",
  vault_keys: "Vault keys",
  ai_usage: "AI usage log",
};

const BUCKETS: Record<string, string> = { files: "ScrapBook files", clips: "Video clips" };

export function tableName(name: string) {
  return TABLES[name] ?? name.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export function bucketName(bucket: string) {
  return BUCKETS[bucket] ?? bucket;
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// Share of a free-plan limit, as a whole percent, at least 1 once anything is used.
export function percentOf(used: number, limit: number) {
  if (used <= 0) return 0;
  return Math.max(1, Math.round((used / limit) * 100));
}
