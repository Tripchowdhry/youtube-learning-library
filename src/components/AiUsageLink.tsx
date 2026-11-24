import { ChartColumn, Images } from "lucide-react";
import Link from "next/link";
import { Ico } from "@/components/Icon";
import ReportWriterLink from "@/components/ReportWriterLink";

// AI usage and Clips, always in view: at the top of the sidebar on tablets and laptops, where the
// sidebar is always open, and as icons in the header on phones, where the sidebar is tucked away.
// The sidebar row also holds Report Writer, except on Report Writer's own page.
const CLIPS_TITLE = "Clips: see and delete your clips to free up space";
export default function AiUsageLink({ sidebar, withReport = true }: { sidebar?: boolean; withReport?: boolean }) {
  const title = "AI usage: answers, speed, tokens, models, storage and bandwidth";
  if (sidebar)
    return (
      // On phones the header already has the AI usage icon, so only Report Writer shows here.
      <div className={`mb-3 grid-cols-2 gap-2 border-b border-slate-200 pb-3 ${withReport ? "grid" : "hidden md:grid"}`}>
        <Link
          href="/ai-usage"
          data-tour="ai-usage"
          title={title}
          className="hidden items-center justify-center gap-1.5 rounded-md px-2.5 py-1 text-sm text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 md:flex"
        >
          <Ico icon={ChartColumn} tone="blue" />
          AI usage
        </Link>
        <Link
          href="/clips"
          data-tour="clips"
          title={CLIPS_TITLE}
          className="hidden items-center justify-center gap-1.5 rounded-md px-2.5 py-1 text-sm text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 md:flex"
        >
          <Ico icon={Images} tone="violet" />
          Clips
        </Link>
        {withReport && (
          <div className="col-span-2 grid [&>a]:justify-center">
            <ReportWriterLink />
          </div>
        )}
      </div>
    );
  return (
    <>
      <Link href="/clips" data-tour="clips" title={CLIPS_TITLE} aria-label="Clips" className="flex shrink-0 items-center rounded-md px-1.5 py-1 hover:bg-slate-100 md:hidden">
        <Ico icon={Images} tone="violet" />
      </Link>
      <Link href="/ai-usage" data-tour="ai-usage" title={title} aria-label="AI usage" className="flex shrink-0 items-center rounded-md px-1.5 py-1 hover:bg-slate-100 md:hidden">
        <Ico icon={ChartColumn} tone="blue" />
      </Link>
    </>
  );
}
