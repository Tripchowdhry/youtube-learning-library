import type { Metadata } from "next";
import DeadEnd from "@/components/DeadEnd";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: `Page not found · ${BRAND.name}` };

export default function NotFound() {
  return <DeadEnd title="Page not found" text="This link doesn't lead anywhere. It may have a typo, or the page may have moved." />;
}
