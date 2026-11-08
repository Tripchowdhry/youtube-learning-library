// BrainShelf's logo: a small stack of colourful books, like the 📚 it replaced, drawn as SVG
// so it looks the same on every device.
export default function BrandLogo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      {/* Bottom book, lying flat */}
      <rect x="2" y="17" width="20" height="5" rx="1.2" fill="#2563eb" />
      <rect x="2" y="18.6" width="20" height="1" fill="#93c5fd" />
      {/* Middle book */}
      <rect x="4" y="12" width="17" height="5" rx="1.2" fill="#16a34a" />
      <rect x="4" y="13.6" width="17" height="1" fill="#86efac" />
      {/* Top book */}
      <rect x="3" y="7" width="15" height="5" rx="1.2" fill="#dc2626" />
      <rect x="3" y="8.6" width="15" height="1" fill="#fca5a5" />
      {/* A book standing up, leaning on the stack */}
      <rect x="17.5" y="1.5" width="4" height="10.5" rx="1" fill="#f59e0b" transform="rotate(12 19.5 12)" />
    </svg>
  );
}
