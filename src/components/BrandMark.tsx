import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";
import { BRAND } from "@/lib/brand";

// The logo in each section's header, which also takes you Home. No tagline here: inside the app
// the room goes to the tabs and search. The tagline stays in the page title and link previews.
export default function BrandMark() {
  return (
    <Link href="/" title={`${BRAND.name}: ${BRAND.tagline}`} className="hidden shrink-0 items-center gap-1.5 rounded-md text-lg font-bold sm:inline-flex">
      <BrandLogo size={24} />
      {BRAND.name}
    </Link>
  );
}
