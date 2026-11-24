import { askText } from "@/components/ConfirmDialog";

// Tags on videos, Reading, Tutorials, ScrapBook pages and reports: your own short labels, at most
// MAX_TAGS each. The AI adds up to 3 more of its own (see ai-tags.ts), shown in purple.
export const MAX_TAGS = 2;

// Asks for an item's tags, separated by commas. Returns the new list, or null if cancelled.
// Typing more than MAX_TAGS keeps the first ones and says so through notify.
export async function askTags(current: string[], notify: (text: string, isError?: boolean) => void): Promise<string[] | null> {
  const answer = await askText({
    title: `Your tags, separated by commas (up to ${MAX_TAGS})`,
    message: "The AI adds up to 3 tags of its own, shown in purple.",
    value: current.join(", "),
    confirmLabel: "Save",
    allowEmpty: true,
  });
  if (answer === null) return null;
  const all = Array.from(new Set(answer.split(",").map((t) => t.trim()).filter(Boolean)));
  const tags = all.slice(0, MAX_TAGS);
  if (all.length > MAX_TAGS) {
    notify(`You can add up to ${MAX_TAGS} tags of your own, so only the first ${MAX_TAGS} were kept: ${tags.join(", ")}.`, true);
  }
  return tags;
}
