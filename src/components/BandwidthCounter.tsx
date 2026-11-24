"use client";

import { useEffect } from "react";
import { addBytes, hasPending, takePending } from "@/lib/bandwidth";
import { createClient } from "@/lib/supabase/client";
import { supabaseUrl } from "@/lib/supabase/config";

// How often a signed-in browser reports what it has counted.
const EVERY_MS = 60_000;

// Counts the data this browser downloads, for the Bandwidth part of the AI usage page. Supabase
// answers are counted as they arrive (see countingFetch); this adds the app's own pages, scripts
// and pictures from Vercel, and pictures straight from Supabase Storage, from the browser's own
// timing records. Things the browser already had saved cost no bandwidth and count as nothing.
// Shows nothing on screen.
export default function BandwidthCounter() {
  useEffect(() => {
    if (typeof PerformanceObserver === "undefined") return;
    const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : null;
    const here = window.location.origin;

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
        const bytes = entry.transferSize ?? 0;
        if (bytes <= 0) continue;
        let origin: string;
        try {
          origin = new URL(entry.name).origin;
        } catch {
          continue;
        }
        if (origin === here) addBytes("vercel", bytes);
        // Supabase's fetch answers are already counted; this is pictures and files it serves.
        else if (origin === supabaseOrigin && entry.initiatorType !== "fetch") addBytes("supabase", bytes);
      }
    });
    try {
      observer.observe({ type: "navigation", buffered: true });
      observer.observe({ type: "resource", buffered: true });
    } catch {
      return;
    }

    const supabase = createClient();
    let sending = false;
    async function report() {
      if (sending || !hasPending()) return;
      sending = true;
      try {
        const { data } = await supabase.auth.getSession();
        const counted = takePending();
        // Only signed-in people are counted; before sign-in the numbers are let go.
        if (!data.session) return;
        const { error } = await supabase.rpc("add_bandwidth", {
          supabase_bytes: counted.supabase,
          supabase_requests: counted.supabaseRequests,
          vercel_bytes: counted.vercel,
          vercel_requests: counted.vercelRequests,
        });
        // Until supabase/bandwidth.sql is run this fails quietly, every time, and nothing changes.
        if (error && !/add_bandwidth/.test(error.message)) console.error("Couldn't save bandwidth", error.message);
      } finally {
        sending = false;
      }
    }

    const timer = window.setInterval(report, EVERY_MS);
    const onHide = () => {
      if (document.visibilityState === "hidden") report();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);
  return null;
}
