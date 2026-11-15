import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";
import type { SharePreview } from "@/lib/shared-preview";

// The picture shown when a shared link is pasted into a chat or a post (1200 x 630).
export const previewSize = { width: 1200, height: 630 };

function Logo({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <rect x="2" y="17" width="20" height="5" rx="1.2" fill="#2563eb" />
      <rect x="2" y="18.6" width="20" height="1" fill="#93c5fd" />
      <rect x="4" y="12" width="17" height="5" rx="1.2" fill="#16a34a" />
      <rect x="4" y="13.6" width="17" height="1" fill="#86efac" />
      <rect x="3" y="7" width="15" height="5" rx="1.2" fill="#dc2626" />
      <rect x="3" y="8.6" width="15" height="1" fill="#fca5a5" />
      <rect x="17.5" y="1.5" width="4" height="10.5" rx="1" fill="#f59e0b" transform="rotate(12 19.5 12)" />
    </svg>
  );
}

// Inter, the font the app uses, so the picture matches it (licensed under the SIL Open Font License).
let fonts: Promise<{ name: string; data: Buffer; weight: 600 | 800; style: "normal" }[]> | null = null;
function loadFonts() {
  fonts ??= Promise.all(
    ([600, 800] as const).map(async (weight) => ({
      name: "Inter",
      data: await readFile(join(process.cwd(), `src/assets/inter-${weight}.ttf`)),
      weight,
      style: "normal" as const,
    })),
  ).catch((e) => {
    fonts = null;
    throw e;
  });
  return fonts;
}

export async function previewCard(preview: SharePreview | null) {
  const title = preview?.title ?? BRAND.headline;
  const fontSize = title.length > 60 ? 56 : title.length > 32 ? 66 : 76;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#f8fafc",
          padding: 64,
          color: "#0f172a",
          fontFamily: "Inter",
          fontWeight: 600,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
          {preview && (
            <div style={{ fontSize: 30, color: "#2563eb", fontWeight: 600 }}>
              {preview.kind === "Report" ? "Report" : `${preview.kind} · ${preview.detail}`}
            </div>
          )}
          <div
            style={{
              fontSize,
              fontWeight: 800,
              letterSpacing: -1.5,
              lineHeight: 1.1,
              marginTop: 12,
              maxWidth: 1060,
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {title}
          </div>
        </div>
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "2px solid #e2e8f0",
            paddingTop: 28,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 32, fontWeight: 800 }}>
            <Logo size={42} />
            {BRAND.name}
          </div>
          <div style={{ fontSize: 26, color: "#64748b" }}>{BRAND.tagline}</div>
        </div>
      </div>
    ),
    { ...previewSize, fonts: await loadFonts().catch(() => undefined) },
  );
}
