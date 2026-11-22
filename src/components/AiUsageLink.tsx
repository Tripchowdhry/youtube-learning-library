import { ChartColumn } from "lucide-react";
import Link from "next/link";
import { Ico } from "@/components/Icon";

// The AI usage page, always in view: at the top of the sidebar on tablets and laptops, where the
// sidebar is always open, and as an icon in the header on phones, where the sidebar is tucked away.
// Pages without a sidebar (Report Writer) pass noSidebar to keep it in the header on every screen.
export default function AiUsageLink({ sidebar, noSidebar }: { sidebar?: boolean; noSidebar?: boolean }) {
  const title = "AI usage: answers, speed, tokens, models and storage";
  if (sidebar)
    return (
      <div className="mb-3 hidden border-b border-slate-200 pb-3 md:block">
        <Link
          href="/ai-usage"
          title={title}
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
        >
          <Ico icon={ChartColumn} tone="blue" />
          AI usage
        </Link>
      </div>
    );
  return (
    <Link
      href="/ai-usage"
      title={title}
      aria-label="AI usage"
      className={`flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-slate-600 hover:bg-slate-100 ${noSidebar ? "" : "md:hidden"}`}
    >
      <Ico icon={ChartColumn} tone="blue" />
      {noSidebar && <span className="hidden 2xl:inline">AI usage</span>}
    </Link>
  );
}
