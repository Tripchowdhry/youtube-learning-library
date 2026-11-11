import { ArrowRight, ScrollText } from "lucide-react";
import Link from "next/link";

// The way into Report Writer, on its own row above the Videos, Reading and Tutorials lists.
// It sits outside the section tabs so the header stays as it was.
export default function ReportWriterLink() {
  return (
    <div className="mb-3">
      <Link
        href="/reports"
        className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-white shadow-sm ring-1 ring-slate-900/10 hover:bg-slate-900"
        title="Turn your notes from videos, readings and tutorials into one report"
      >
        <ScrollText size={16} aria-hidden />
        <span className="font-semibold">Report Writer</span>
        <span className="hidden text-slate-300 md:inline">Turn your notes into one report</span>
        <ArrowRight size={14} className="text-slate-400" aria-hidden />
      </Link>
    </div>
  );
}
