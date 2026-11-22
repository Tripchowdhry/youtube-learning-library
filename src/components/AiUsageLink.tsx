import { ChartColumn } from "lucide-react";
import Link from "next/link";
import { Ico } from "@/components/Icon";

// The link to the AI usage page in the Categories menu on phones. Wider screens reach it from
// the account menu in the header.
export default function AiUsageLink() {
  return (
    <Link
      href="/ai-usage"
      className="mt-6 flex shrink-0 sm:hidden items-center gap-1.5 rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
      title="How the AI is doing: answers, speed, tokens and models"
    >
      <Ico icon={ChartColumn} tone="blue" />
      <span>AI usage</span>
    </Link>
  );
}
