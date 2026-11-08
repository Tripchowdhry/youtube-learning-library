import BrandLogo from "@/components/BrandLogo";
import { BRAND } from "@/lib/brand";

// The logo in each section's header. The tagline shows only on wide screens so the header stays roomy.
export default function BrandMark() {
  return (
    <span className="hidden shrink-0 items-center gap-2 sm:inline-flex">
      <span className="flex items-center gap-1.5 text-lg font-bold">
        <BrandLogo size={24} />
        {BRAND.name}
      </span>
      <span className="hidden text-xs text-slate-500 xl:inline">{BRAND.tagline}</span>
    </span>
  );
}
