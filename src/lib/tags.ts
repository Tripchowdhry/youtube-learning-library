// Tags on videos, Reading, Tutorials and ScrapBook items: short labels, at most MAX_TAGS each.
export const MAX_TAGS = 3;

// Asks for an item's tags, separated by commas. Returns the new list, or null if cancelled.
// Typing more than MAX_TAGS keeps the first ones and says so through notify.
export function askTags(current: string[], notify: (text: string, isError?: boolean) => void): string[] | null {
  const answer = window.prompt(`Tags, separated by commas (up to ${MAX_TAGS}):`, current.join(", "));
  if (answer === null) return null;
  const all = Array.from(new Set(answer.split(",").map((t) => t.trim()).filter(Boolean)));
  const tags = all.slice(0, MAX_TAGS);
  if (all.length > MAX_TAGS) {
    notify(`Each item can have up to ${MAX_TAGS} tags, so only the first ${MAX_TAGS} were kept: ${tags.join(", ")}.`, true);
  }
  return tags;
}
