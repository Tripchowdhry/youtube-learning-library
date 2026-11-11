import { Ico } from "@/components/Icon";
import { ChevronRight, FileStack } from "lucide-react";
import Link from "next/link";

// The way into Report Writer, on its own row above the Videos, Reading and Tutorials lists.
// It sits outside the section tabs so the header stays as it was, and uses the same
// two-tone icons and white buttons as the rest of the app.
export default function ReportWriterLink() {
  return (
    <div className="mb-3">
      <Link
        href="/reports"
        className="group inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm shadow-sm ring-1 ring-slate-200 hover:ring-green-300 hover:bg-green-50/40"
        title="Turn your notes from videos, readings and tutorials into one report"
      >
        <Ico icon={FileStack} tone="green" size={18} />
        <span className="font-semibold text-slate-800">Report Writer</span>
        <span className="hidden text-slate-500 md:inline">Turn your notes into one report</span>
        <ChevronRight size={14} className="text-slate-400 group-hover:text-green-600" aria-hidden />
      </Link>
    </div>
  );
}
