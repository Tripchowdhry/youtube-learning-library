import type { Metadata, Viewport } from "next";
import "./globals.css";
import AiJobsBadge from "@/components/AiJobsBadge";
import { ConfirmHost } from "@/components/ConfirmDialog";

export const metadata: Metadata = {
  title: "StudyShelf",
  description: "Save the videos, articles and tutorials you learn from, with notes and AI help, on every device.",
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
