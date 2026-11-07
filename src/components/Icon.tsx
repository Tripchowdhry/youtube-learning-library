import type { LucideIcon } from "lucide-react";

// Coloured icons in place of emoji: a darker outline over a light fill, in the emoji's own colour,
// so they keep the warmth of the emoji but look the same on every device.
export const TONES = {
  red: { stroke: "#dc2626", fill: "#fee2e2" },
  orange: { stroke: "#ea580c", fill: "#ffedd5" },
  amber: { stroke: "#d97706", fill: "#fef3c7" },
  yellow: { stroke: "#ca8a04", fill: "#fef08a" },
  green: { stroke: "#16a34a", fill: "#dcfce7" },
  sky: { stroke: "#0284c7", fill: "#e0f2fe" },
  blue: { stroke: "#2563eb", fill: "#dbeafe" },
  indigo: { stroke: "#4f46e5", fill: "#e0e7ff" },
  violet: { stroke: "#7c3aed", fill: "#ede9fe" },
  slate: { stroke: "#475569", fill: "#f1f5f9" },
} as const;

export type Tone = keyof typeof TONES;

export function Ico({ icon: Icon, tone, size = 16, className }: { icon: LucideIcon; tone: Tone; size?: number; className?: string }) {
  const t = TONES[tone];
  return <Icon size={size} color={t.stroke} fill={t.fill} strokeWidth={2} className={`shrink-0 ${className ?? ""}`} aria-hidden />;
}
