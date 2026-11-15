import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";
import { BRAND } from "@/lib/brand";

// The page shown when there's nothing here: a wrong link, a turned-off share link or something
// deleted. Always gives one clear way back.
export default function DeadEnd({
  title,
  text,
  href = "/",
  label = `Go to ${BRAND.name}`,
  onRetry,
}: {
  title: string;
  text: string;
  href?: string;
  label?: string;
  onRetry?: () => void;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-16 text-center">
      <Link href="/" className="mb-8 flex items-center gap-2 text-lg font-bold text-slate-900">
        <BrandLogo size={28} />
        {BRAND.name}
      </Link>
      <h1 className="mb-2 text-2xl font-bold text-slate-900">{title}</h1>
      <p className="mb-8 max-w-md text-slate-600">{text}</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {onRetry && (
          <button
            onClick={onRetry}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Try again
          </button>
        )}
        <Link href={href} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          {label}
        </Link>
      </div>
    </main>
  );
}
