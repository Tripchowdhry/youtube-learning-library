import { ArrowRight, ScrollText } from "lucide-react";
import Link from "next/link";

// The way into Report Writer, on its own row above the Videos, Reading and Tutorials lists.
// It sits outside the section tabs so the header stays as it was.
export default function ReportWriterLink() {
  return (
    <div className="mb-3">
      <Link
        href="/reports"
        className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-3.5 py-1.5 text-sm text-white shadow-sm hover:from-emerald-600 hover:to-teal-600"
        title="Turn your notes from videos, readings and tutorials into one report"
      >
        <ScrollText size={16} aria-hidden />
        <span className="font-semibold">Report Writer</span>
        <span className="hidden text-emerald-50 md:inline">· turn your notes into one report</span>
        <ArrowRight size={14} aria-hidden />
      </Link>
    </div>
  );
}
