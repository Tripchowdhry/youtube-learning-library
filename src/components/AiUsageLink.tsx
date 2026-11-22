import { ChartColumn } from "lucide-react";
import Link from "next/link";
import { Ico } from "@/components/Icon";

// The AI usage page, always in view: at the top of the sidebar on tablets and laptops, where the
// sidebar is always open, and as an icon in the header on phones, where the sidebar is tucked away.
export default function AiUsageLink({ sidebar }: { sidebar?: boolean }) {
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
    <Link href="/ai-usage" title={title} aria-label="AI usage" className="flex shrink-0 items-center rounded-md px-1.5 py-1 hover:bg-slate-100 md:hidden">
      <Ico icon={ChartColumn} tone="blue" />
    </Link>
  );
}
