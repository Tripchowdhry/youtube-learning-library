import Link from "next/link";

// Report Writer's own icon: a page of notes with a sparkle. Its navy (#2b3b5e) is used
// for Report Writer's text; its buttons have a soft lavender background.
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

// The way into Report Writer, at the top of the sidebar next to AI usage. On phones that is the
// Categories panel.
export default function ReportWriterLink() {
  return (
    <Link
      data-tour="report-writer"
      href="/reports"
      title="Report Writer: turn your notes from videos, readings, tutorials and ScrapBook into one report"
      className="inline-flex items-center gap-1.5 rounded-md bg-[#f6f3ff] py-1 pr-2.5 pl-1.5 text-sm font-medium text-[#2b3b5e] ring-1 ring-[#e2d9fb] hover:bg-[#efeaff]"
    >
      <ReportIcon size={18} />
      Report Writer
    </Link>
  );
}
