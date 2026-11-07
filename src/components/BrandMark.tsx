import { BRAND } from "@/lib/brand";

// The logo in each section's header. The tagline shows only on wide screens so the header stays roomy.
export default function BrandMark() {
  return (
    <span className="hidden shrink-0 items-baseline gap-2 sm:inline-flex">
      <span className="text-lg font-bold">📚 {BRAND.name}</span>
      <span className="hidden text-xs text-slate-500 xl:inline">{BRAND.tagline}</span>
    </span>
  );
}
