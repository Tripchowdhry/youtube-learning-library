// The short tours, one per section. Each step points at an element marked data-tour="<target>";
// a step without a target (or whose target isn't on screen) shows in the middle of the page.

export type TourStep = { target?: string; title: string; text: string };

export const TOURS = {
  videos: [
    {
      target: "add-video",
      title: "Save what you're learning",
      text: "Paste any YouTube link here. BrainShelf fills in the details and sorts it into a category by channel. Make your own categories and subcategories too.",
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
      target: "ask-category",
      title: "Ask a whole category",
      text: "Open a category and tap Ask this category to ask one question across all its videos. Each answer says which video it came from, and tapping a time jumps to that moment.",
    },
    {
      target: "report-writer",
      title: "Turn notes into a report",
      text: "Report Writer pulls your notes from videos, readings, tutorials and ScrapBook into one report. Edit it, share a read-only link, or download it as Word or PDF.",
    },
    {
      target: "clips",
      title: "Your clips in one place",
      text: "See every screenshot you've clipped into your notes, and delete the ones you don't need to free up space.",
    },
    {
      target: "ai-usage",
      title: "See your AI usage",
      text: "AI usage shows how many answers AI gave you, how fast, which models, and how much space your notes and files take.",
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
      text: "In Typing, Copy puts your notes, with their formatting and clips, into Word, Google Docs or an email. Download saves them as a Word file or a PDF.",
    },
  ],
  // Reading and Tutorials work the same way, so seeing it in one counts for both.
  articles: [
    {
      target: "add-article",
      title: "Save anything you read",
      text: "Paste a link to an article, an X post or any web page. BrainShelf sorts it into a category named after its author (or its company), or pick a category yourself.",
    },
    {
      target: "read-filter",
      title: "Know what you've finished",
      text: "Open an item to read it here. Scrolling to the end ticks it ✓ Read, or tap the ✓ yourself. Use Filter, then Unread, to see what's left.",
    },
    {
      title: "Notes beside what you read",
      text: "While reading, open My notes to type with headings, bold and lists, or switch to Handwriting for Apple Pencil. Ask AI for a summary and add clips. Copy or Download (Word or PDF) takes typed notes anywhere.",
    },
    {
      target: "ask-category",
      title: "Ask a whole category",
      text: "Open a category and tap Ask this category to ask one question across everything in it. Each answer says which item it came from.",
    },
    {
      target: "report-writer",
      title: "Turn notes into a report",
      text: "Report Writer pulls your notes from readings, tutorials, videos and ScrapBook into one report. Edit it, share a read-only link, or download it as Word or PDF.",
    },
  ],
  scrapbook: [
    {
      target: "new-page",
      title: "Pages of your own",
      text: "Give a page a title and tap + New page to write, type or draw freely, and sort pages into categories and subcategories.",
    },
    {
      title: "Type like in Word",
      text: "When typing on a page, use the toolbar for headings, bold, lists and highlight, add clips, then Copy it or Download it as Word or PDF. Add file puts PDFs, slides, documents, pictures and videos on the page. They stay on your computer, and Ask AI can read or watch them for you.",
    },
    {
      target: "ask-category",
      title: "Ask a whole category",
      text: "Open a category and tap Ask this category to ask one question across all its pages. Each answer says which page it came from.",
    },
  ],
  vault: [
    {
      title: "Logins and API keys, kept safe",
      text: "Passwords and API keys are locked in your browser with a passphrase only you know, before they're saved. Web addresses and user IDs stay readable, so you can still reset things if you forget it. The vault locks itself after 5 idle minutes. Sort entries into categories and subcategories, like the other tabs.",
    },
  ],
  // Report Writer's list of reports.
  reports: [
    {
      target: "new-report",
      title: "Start a report",
      text: "Tap + New report to bring notes from your videos, readings, tutorials and ScrapBook together into one report. Open a category first and the new report is filed there.",
    },
    {
      target: "report-categories",
      title: "Keep reports in categories",
      text: "Make categories and subcategories with +, then drag a report onto one, or pick its category on the report. Right-click a category to rename, move or delete it.",
    },
  ],
  // One report, in Report Writer.
  report: [
    {
      target: "report-choose",
      title: "1. Choose your notes",
      text: "Tap Add or remove to pick the videos, readings, tutorials and ScrapBook pages to use. The arrows set their order in the report.",
    },
    {
      target: "report-build",
      title: "2. Build the report",
      text: "Put together copies your notes in as they are, with no AI. Draft with AI writes one report from them: a summary, a study guide, key takeaways or a quiz.",
    },
    {
      target: "report-export",
      title: "3. Edit, share and download",
      text: "Edit the report like in Word, and use Improve to have AI rewrite a part. Then Copy it, Share a read-only link, or Download it as Word or PDF. It saves as you type.",
    },
  ],
} satisfies Record<string, TourStep[]>;

export type TourId = keyof typeof TOURS;
