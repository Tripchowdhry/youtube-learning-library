"use client";

import "./globals.css";
import DeadEnd from "@/components/DeadEnd";

// Shown if the whole app fails to start. It replaces the root layout, so it brings its own <html>.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <DeadEnd
          title="Something went wrong"
          text="BrainShelf hit a problem. Anything already saved is safe. Try again in a moment."
          onRetry={reset}
        />
      </body>
    </html>
  );
}
