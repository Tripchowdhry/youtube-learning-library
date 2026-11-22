// Turns an error from the database, storage or the network into a sentence a person can act
// on. Messages the app wrote itself (already plain sentences) pass through unchanged.

const RULES: [RegExp, string][] = [
  [
    /failed to fetch|networkerror|load failed|network request failed|fetch failed|err_network|err_internet|econn|enotfound/i,
    "Couldn't reach BrainShelf. Check your internet connection and try again.",
  ],
  [/timeout|timed out|aborted/i, "That took too long. Please try again."],
  [
    /jwt|refresh token|not authenticated|invalid claim|session (has )?expired|auth session missing/i,
    "You've been signed out. Refresh the page and sign in again.",
  ],
  [/row-level security|permission denied|not authorized|unauthorized|403/i, "BrainShelf couldn't save that. Refresh the page and try again."],
  [/duplicate key|already exists/i, "That's already saved."],
  [/payload too large|too large|413|exceeded the maximum allowed size/i, "That's too big to save."],
  [/rate limit|too many requests|429/i, "Too many changes at once. Wait a moment and try again."],
  [/service unavailable|bad gateway|gateway timeout|50[234]/i, "BrainShelf's storage is busy right now. Try again in a minute."],
];

// Signs that a message was written for programmers, not people.
const TECHNICAL =
  /PGRST|\bpostgres|relation |column |constraint|syntax|invalid input|null value|violates|schema cache|undefined|TypeError|SyntaxError|unexpected token|status code|\{|\}|::/i;

export function friendlyError(message: string | null | undefined): string {
  const text = (message ?? "").trim();
  if (!text) return "Something went wrong. Please try again.";
  for (const [pattern, plain] of RULES) if (pattern.test(text)) return plain;
  if (TECHNICAL.test(text)) return "Something went wrong. Please try again.";
  return text;
}

// A feature whose database step hasn't been run yet. People see a plain sentence; the setup
// detail (which SQL file to run in Supabase) goes to the browser console for whoever runs the app.
export function notSetUp(sqlFile: string, message: string): string {
  if (typeof console !== "undefined") console.warn(`BrainShelf setup: run supabase/${sqlFile} in the Supabase SQL Editor, then reload.`);
  return message;
}
