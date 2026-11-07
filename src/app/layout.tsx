import type { Metadata, Viewport } from "next";
import "./globals.css";
import AiJobsBadge from "@/components/AiJobsBadge";
import { ConfirmHost } from "@/components/ConfirmDialog";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: `${BRAND.name}: ${BRAND.tagline}`,
  description: `${BRAND.headline} ${BRAND.description}`,
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
        <AiJobsBadge />
      </body>
    </html>
  );
}
