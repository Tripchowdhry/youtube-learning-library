"use client";

import { FileDown } from "lucide-react";
import { useState } from "react";
import { pictureUrl } from "@/lib/report";
import { downloadWord } from "@/lib/report-export";
import { createClient } from "@/lib/supabase/client";

// Download Word on a shared report's page, for the people it was shared with.
export default function SharedReportDownload({ title, body }: { title: string; body: string }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function download() {
    setBusy(true);
    setFailed(false);
    try {
      const supabase = createClient();
      await downloadWord(title, body, (src) => pictureUrl(supabase, src));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      onClick={download}
      disabled={busy}
      className="ml-auto flex shrink-0 items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1 text-sm hover:bg-slate-50 disabled:opacity-60"
    >
      <FileDown size={14} aria-hidden /> {busy ? "Making file…" : failed ? "Try again" : "Download Word"}
    </button>
  );
}
