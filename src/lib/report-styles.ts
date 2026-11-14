// The kinds of report Draft with AI can write. Shared by the report page (the chips) and
// /api/report-ai (what the AI is asked to write).

export type DraftStyle = "summary" | "study" | "takeaways" | "quiz";

export const DRAFT_STYLES: {
  key: DraftStyle;
  label: string;
  // The Draft button's wording, like "Draft a summary".
  button: string;
  // A few words under the chips saying what you'll get.
  note: string;
  // What the AI is asked to write.
  ask: string;
}[] = [
  {
    key: "summary",
    label: "Summary",
    button: "Draft a summary",
    note: "A short overview, then the main ideas grouped by theme.",
    ask: "Write a clear, well-organised report that brings these notes together. Start with a short summary, then group the main ideas by theme.",
  },
  {
    key: "study",
    label: "Study guide",
    button: "Draft a study guide",
    note: "Key terms explained, the main concepts, and things to remember.",
    ask:
      "Write a study guide from these notes. Start with a '## Key terms' section explaining each important term in a line or two, " +
      "then '## Main concepts' explaining the big ideas, and end with '## Things to remember' as a short bullet list.",
  },
  {
    key: "takeaways",
    label: "Key takeaways",
    button: "Draft key takeaways",
    note: "5 to 10 bullet points with the most important ideas.",
    ask: "Write only the 5 to 10 most important takeaways from these notes, as a bullet list. Each bullet is one or two sentences. No headings or introduction.",
  },
  {
    key: "quiz",
    label: "Quiz me",
    button: "Draft a quiz",
    note: "10 questions from your notes, with the answers at the end.",
    ask:
      "Write a quiz to test someone on these notes: up to 10 questions under '## Questions' as a numbered list, mixing short-answer and " +
      "multiple-choice questions, then '## Answers' as a numbered list with each answer and its source number.",
  },
];

export const draftStyle = (key: unknown) => DRAFT_STYLES.find((s) => s.key === key) ?? DRAFT_STYLES[0];
