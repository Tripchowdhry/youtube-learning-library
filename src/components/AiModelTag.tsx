// The AI model working on a request right now, shown beside its spinner, e.g. "Gemini 4 Hydrogen".
// Changes when the next model takes over.
export default function AiModelTag({ model, className = "" }: { model?: string | null; className?: string }) {
  if (!model) return null;
  return (
    <span
      title="The AI model working on this now"
      className={`inline-block whitespace-nowrap rounded-full bg-white px-1.5 py-px align-[1px] text-[11px] font-medium text-violet-700 ring-1 ring-violet-200 ${className}`}
    >
      {model}
    </span>
  );
}
