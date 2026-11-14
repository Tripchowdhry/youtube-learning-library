import type { LucideIcon } from "lucide-react";

// Coloured icons in place of emoji: a darker outline over a light fill. The colours are the four
// from the BrainShelf logo (blue, green, red and amber books) plus a quiet grey, so every icon
// in the app matches the logo.
export const TONES = {
  blue: { stroke: "#2563eb", fill: "#dbeafe" },
  green: { stroke: "#16a34a", fill: "#dcfce7" },
  red: { stroke: "#dc2626", fill: "#fee2e2" },
  amber: { stroke: "#d97706", fill: "#fef3c7" },
  slate: { stroke: "#475569", fill: "#f1f5f9" },
} as const;

export type Tone = keyof typeof TONES;

export function Ico({ icon: Icon, tone, size = 16, className }: { icon: LucideIcon; tone: Tone; size?: number; className?: string }) {
  const t = TONES[tone];
  return <Icon size={size} color={t.stroke} fill={t.fill} strokeWidth={2} className={`shrink-0 ${className ?? ""}`} aria-hidden />;
}
