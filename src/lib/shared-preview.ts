import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { SharedCategory, SharedVideoCategory } from "@/lib/types";
import type { SharedReport } from "@/lib/report";

// What a link preview (WhatsApp, iMessage, LinkedIn…) shows for a shared link: only the name
// and a count, never notes or a report's text.
export type SharePreview = { kind: string; title: string; detail: string };

const isToken = (token: string) => /^[0-9a-f-]{36}$/i.test(token);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const KIND_LABELS = {
  reading: { label: "Shared reading list", what: "link" },
  tutorial: { label: "Shared tutorials", what: "link" },
  scrap: { label: "Shared ScrapBook pages", what: "page" },
} as const;

// A shared Videos category, or a Reading, Tutorials or ScrapBook one.
export const shareLinkPreview = cache(async (token: string): Promise<SharePreview | null> => {
  if (!isToken(token)) return null;
  try {
    const supabase = await createClient();
    const videos = (await supabase.rpc("get_shared_video_category", { token })).data as SharedVideoCategory | null;
    if (videos) {
      return { kind: "Shared category", title: videos.category.name, detail: plural(videos.videos.length, "video") };
    }
    const other = (await supabase.rpc("get_shared_category", { token })).data as SharedCategory | null;
    if (!other) return null;
    const kind = KIND_LABELS[other.category.kind] ?? KIND_LABELS.reading;
    const count = kind.what === "page" ? other.scraps.length : other.articles.length;
    return { kind: kind.label, title: other.category.name, detail: plural(count, kind.what) };
  } catch {
    return null;
  }
});

// A shared report: its title only.
export const reportLinkPreview = cache(async (token: string): Promise<SharePreview | null> => {
  if (!isToken(token)) return null;
  try {
    const supabase = await createClient();
    const report = (await supabase.rpc("get_shared_report", { token })).data as SharedReport | null;
    return report ? { kind: "Report", title: report.title, detail: "A report shared from BrainShelf" } : null;
  } catch {
    return null;
  }
});
