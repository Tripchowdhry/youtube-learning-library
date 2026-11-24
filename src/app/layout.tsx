import type { Metadata, Viewport } from "next";
import "./globals.css";
import AiJobsBadge from "@/components/AiJobsBadge";
import AppSearch from "@/components/AppSearch";
import BandwidthCounter from "@/components/BandwidthCounter";
import { ConfirmHost } from "@/components/ConfirmDialog";
import { BRAND } from "@/lib/brand";

// The site's own address, so link previews (WhatsApp, iMessage, LinkedIn…) can find the picture.
const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: `${BRAND.name}: ${BRAND.tagline}`,
  description: `${BRAND.headline} ${BRAND.description}`,
  openGraph: {
    type: "website",
    siteName: BRAND.name,
    title: `${BRAND.name}: ${BRAND.tagline}`,
    description: BRAND.headline,
  },
  twitter: { card: "summary_large_image", title: `${BRAND.name}: ${BRAND.tagline}`, description: BRAND.headline },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <ConfirmHost />
        <AppSearch />
        <AiJobsBadge />
        <BandwidthCounter />
      </body>
    </html>
  );
}
