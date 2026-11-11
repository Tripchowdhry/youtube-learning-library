import { ChevronRight } from "lucide-react";
import Link from "next/link";

// Report Writer's own icon: a report with charts and a pen. Its navy (#2b3b5e) is used
// for Report Writer's text and main button.
export function ReportIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/report-writer-icon.png"
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={`shrink-0 rounded-[22%] ${className ?? ""}`}
    />
  );
}

// The way into Report Writer, on its own row above the Videos, Reading and Tutorials lists.
// It sits outside the section tabs, so the header stays as it was.
export default function ReportWriterLink() {
  return (
    <div className="mb-3">
      <Link
        href="/reports"
        className="group inline-flex items-center gap-2 rounded-lg bg-white py-1 pr-3 pl-1.5 text-sm shadow-sm ring-1 ring-[#d3dbea] hover:bg-[#f3f6fb] hover:ring-[#2b3b5e]/40"
        title="Turn your notes from videos, readings and tutorials into one report"
      >
        <ReportIcon size={26} />
        <span className="font-semibold text-[#2b3b5e]">Report Writer</span>
        <span className="hidden text-slate-500 md:inline">Turn your notes into one report</span>
        <ChevronRight size={14} className="text-slate-400 group-hover:text-[#ea7a1e]" aria-hidden />
      </Link>
    </div>
  );
}
