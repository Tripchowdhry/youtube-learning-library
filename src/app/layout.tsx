import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ConfirmHost } from "@/components/ConfirmDialog";

export const metadata: Metadata = {
  title: "YouTube Learning Library",
  description: "Organize the YouTube videos you learn from into folders, on every device.",
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
      </body>
    </html>
  );
}
