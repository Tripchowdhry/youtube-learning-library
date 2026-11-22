import { ChartColumn } from "lucide-react";
import Link from "next/link";
import { Ico } from "@/components/Icon";

// The AI usage page, always one click away in the header on every tab and screen size: an icon,
// with its name beside it on laptops and wider.
export default function AiUsageLink() {
  return (
    <Link
      href="/ai-usage"
      className="flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-slate-600 hover:bg-slate-100 sm:px-2"
      title="AI usage: answers, speed, tokens, models and storage"
      aria-label="AI usage"
    >
      <Ico icon={ChartColumn} tone="blue" />
      <span className="hidden xl:inline">AI usage</span>
    </Link>
  );
}
