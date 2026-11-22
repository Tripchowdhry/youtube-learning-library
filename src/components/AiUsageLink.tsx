import { ChartColumn } from "lucide-react";
import Link from "next/link";
import { Ico } from "@/components/Icon";

// The link to the AI usage page: in the header on wide screens, and in the Categories
// sidebar on laptops, tablets and phones, where the header has no room for it.
export default function AiUsageLink({ phoneMenu }: { phoneMenu?: boolean }) {
  return (
    <Link
      href="/ai-usage"
      className={`${phoneMenu ? "mt-6 flex 2xl:hidden" : "hidden 2xl:flex"} shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100`}
      title="How the AI is doing: answers, speed, tokens and models"
    >
      <Ico icon={ChartColumn} tone="blue" />
      <span>AI usage</span>
    </Link>
  );
}
