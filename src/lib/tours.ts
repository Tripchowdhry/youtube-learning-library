// The short tours, one per section. Each step points at an element marked data-tour="<target>";
// a step without a target (or whose target isn't on screen) shows in the middle of the page.

export type TourStep = { target?: string; title: string; text: string };

export const TOURS = {
  videos: [
    {
      target: "add-video",
      title: "Save what you're learning",
      text: "Paste any YouTube link here. BrainShelf fills in the details and sorts it into a category by channel.",
    },
    {
      target: "sections",
      title: "Not just videos",
      text: "Switch here to save articles, posts and tutorials, keep a ScrapBook, or store logins in the Vault.",
    },
    {
      target: "search",
      title: "Find it again",
      text: "Search everything you've saved, including your notes. Open any video to take notes beside it and Ask AI.",
    },
    {
      target: "report-writer",
      title: "Turn notes into a report",
      text: "Report Writer pulls your notes from videos, readings and tutorials into one report you can edit, copy or download for Word.",
    },
    {
      target: "clips",
      title: "Your clips in one place",
      text: "See every screenshot you've clipped into your notes, and delete the ones you don't need to free up space.",
    },
  ],
  study: [
    {
      target: "note-mode",
      title: "Write or type",
      text: "Write with an Apple Pencil, a mouse or your finger, or switch to Typing for a Word-style editor with headings, bold, lists and links. Your notes save on their own.",
    },
    {
      target: "stamp",
      title: "Stamp the moment",
      text: "Tap Stamp time (or Ctrl+Shift+S while typing) to pin where the video is right now. Tap that time later to jump straight back.",
    },
    {
      target: "clip",
      title: "Clip a picture",
      text: "Tap Clip to put a screenshot of the video into your notes.",
    },
    {
      target: "ask-ai",
      title: "Ask AI about the video",
      text: "Get a summary, a bullet report, or an explanation of any moment. Answers land in your typed notes, ready to edit.",
    },
    {
      target: "notes-export",
      title: "Copy or download your notes",
      text: "In Typing, Copy puts your notes, with their formatting and clips, into Word, Google Docs or an email. Download Word saves them as a file.",
    },
  ],
  // Reading and Tutorials work the same way, so seeing it in one counts for both.
  articles: [
    {
      target: "add-article",
      title: "Save anything you read",
      text: "Paste a link to an article, an X post or any web page, and pick a category so it's easy to find again.",
    },
    {
      target: "read-filter",
      title: "Know what you've finished",
      text: "Open an item to read it here. Scrolling to the end ticks it ✓ Read, or tap the ✓ yourself. Pick Unread to see what's left.",
    },
    {
      title: "Notes beside what you read",
      text: "While reading, open My notes to type with headings, bold and lists, Ask AI for a summary, and add clips. Copy or Download Word takes them anywhere.",
    },
    {
      target: "report-writer",
      title: "Turn notes into a report",
      text: "Report Writer pulls your notes from readings, tutorials and videos into one report you can edit, copy or download for Word.",
    },
  ],
  scrapbook: [
    {
      target: "new-page",
      title: "Pages of your own",
      text: "Give a page a title and tap + New page to write, type or draw freely, and sort pages into categories.",
    },
    {
      title: "Type like in Word",
      text: "When typing on a page, use the toolbar for headings, bold, lists and highlight, add clips, then Copy it or Download Word.",
    },
  ],
  vault: [
    {
      title: "Logins and API keys, kept safe",
      text: "Passwords and API keys are locked in your browser with a passphrase only you know, before they're saved. Web addresses and user IDs stay readable, so you can still reset things if you forget it. The vault locks itself after 5 idle minutes.",
    },
  ],
} satisfies Record<string, TourStep[]>;

export type TourId = keyof typeof TOURS;
