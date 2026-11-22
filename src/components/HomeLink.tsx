import { House } from "lucide-react";
import Link from "next/link";

// A Home button for inner pages (an article, a ScrapBook page, a report, AI usage): one click
// back to the Videos tab, BrainShelf's front page, wherever you are.
export default function HomeLink({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      title="Home"
      aria-label="Home"
      className={`flex shrink-0 items-center rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 ${className}`}
    >
      <House size={18} aria-hidden />
    </Link>
  );
}
