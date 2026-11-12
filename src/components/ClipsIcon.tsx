// The Clips icon: a video with a camera and a paperclip. Used wherever clips appear:
// the Clips link in each tab's header, the Clip buttons, and the Manage clips page.
export default function ClipsIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/clips-icon.png"
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={`inline-block shrink-0 rounded-[22%] ${className ?? ""}`}
    />
  );
}
