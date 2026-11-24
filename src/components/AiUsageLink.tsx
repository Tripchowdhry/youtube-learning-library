import { ChartColumn } from "lucide-react";
import Link from "next/link";
import { Ico } from "@/components/Icon";
import ReportWriterLink from "@/components/ReportWriterLink";

// The AI usage page, always in view: at the top of the sidebar on tablets and laptops, where the
// sidebar is always open, and as an icon in the header on phones, where the sidebar is tucked away.
// The sidebar row also holds Report Writer, except on Report Writer's own page.
export default function AiUsageLink({ sidebar, withReport = true }: { sidebar?: boolean; withReport?: boolean }) {
  const title = "AI usage: answers, speed, tokens, models, storage and bandwidth";
  if (sidebar)
    return (
      // On phones the header already has the AI usage icon, so only Report Writer shows here.
      <div className={`mb-3 flex-wrap gap-2 border-b border-slate-200 pb-3 ${withReport ? "flex" : "hidden md:flex"}`}>
        <Link
          href="/ai-usage"
          data-tour="ai-usage"
          title={title}
          className="hidden items-center gap-1.5 rounded-md px-2.5 py-1 text-sm text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 md:inline-flex"
        >
          <Ico icon={ChartColumn} tone="blue" />
          AI usage
        </Link>
        {withReport && <ReportWriterLink />}
      </div>
    );
  return (
    <Link href="/ai-usage" data-tour="ai-usage" title={title} aria-label="AI usage" className="flex shrink-0 items-center rounded-md px-1.5 py-1 hover:bg-slate-100 md:hidden">
      <Ico icon={ChartColumn} tone="blue" />
    </Link>
  );
}
