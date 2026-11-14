"use client";

import { useState } from "react";
import DownloadMenu from "@/components/DownloadMenu";
import { pictureUrl } from "@/lib/report";
import { createClient } from "@/lib/supabase/client";

// Download (Word or PDF) on a shared report's page, for the people it was shared with.
export default function SharedReportDownload({ title, body }: { title: string; body: string }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="ml-auto flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <DownloadMenu
        title={title}
        makeDocument={() => body}
        resolve={(src) => pictureUrl(createClient(), src)}
        onError={setError}
        variant="plain"
      />
    </div>
  );
}
