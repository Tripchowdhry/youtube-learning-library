"use client";

import { useEffect } from "react";
import DeadEnd from "@/components/DeadEnd";

// Shown if a page crashes, in place of a blank screen. Saved work is kept in the database.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <DeadEnd
      title="Something went wrong"
      text="This page hit a problem. Anything already saved is safe. Try again, or go back to your library."
      onRetry={reset}
    />
  );
}
