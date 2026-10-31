export type Folder = {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  position: number;
  share_token: string | null;
  created_at: string;
};

export type Video = {
  id: string;
  user_id: string;
  folder_id: string | null;
  youtube_id: string;
  url: string;
  title: string | null;
  channel: string | null;
  thumbnail_url: string | null;
  tags: string[];
  note: string;
  // Missing until video-watched.sql has been run.
  watched_at?: string | null;
  position: number;
  created_at: string;
};

export type SharedFolder = {
  folder: { id: string; name: string };
  folders: Pick<Folder, "id" | "name" | "parent_id" | "position">[];
  videos: Pick<
    Video,
    "id" | "folder_id" | "youtube_id" | "url" | "title" | "channel" | "thumbnail_url" | "tags" | "position"
  >[];
};

// Handwritten notes. Coordinates are in page units (PAGE_WIDTH x PAGE_HEIGHT), so
// notes look the same on any screen size.
export type NotePoint = [x: number, y: number, pressure: number];

export type NoteStroke = {
  tool: "pen" | "highlighter";
  color: string;
  size: number;
  points: NotePoint[];
};

// A video time (in seconds) pinned onto the page; tapping it jumps the video there.
export type NoteStamp = { id: string; t: number; x: number; y: number };

export type NotePage = {
  strokes: NoteStroke[];
  stamps: NoteStamp[];
  images?: NoteImage[];
};

// A pasted picture on a handwriting page (t is the video time when it was added).
export type NoteImage = {
  id: string;
  path: string;
  x: number;
  y: number;
  w: number;
  h: number;
  t: number;
};

// The Reading and Tutorials sections share the same tables, told apart by kind.
export type SectionKind = "reading" | "tutorial";

// Categories also belong to the ScrapBook, which keeps your own pages instead of links.
export type CategoryKind = SectionKind | "scrap";

// Reading section: categories are two levels deep (parent_id is null or a top-level category).
export type ArticleCategory = {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  position: number;
  kind: CategoryKind;
  created_at: string;
};

export type Article = {
  id: string;
  user_id: string;
  category_id: string | null;
  url: string;
  title: string | null;
  site: string | null;
  author: string | null;
  note: string;
  // Study notes typed on the reading page (and AI answers). Missing until the SQL is run.
  notes?: string;
  position: number;
  kind: SectionKind;
  read_at: string | null;
  created_at: string;
};

// What the reading page shows: an X post, the article's text, or nothing (open the original instead).
export type ArticleBlock = { type: "h" | "p" | "li" | "quote"; text: string };

export type ArticleContent =
  | { kind: "x"; postId: string }
  | { kind: "text"; blocks: ArticleBlock[] }
  | { kind: "none" };

// A ScrapBook page: typed text (simple HTML) and/or handwriting pages.
export type Scrap = {
  id: string;
  user_id: string;
  category_id: string | null;
  title: string;
  body: string;
  pages: NotePage[];
  position: number;
  created_at: string;
  updated_at: string;
};

// Vault: logins and API keys in categories. password and api_key are encrypted in the
// browser ("iv.ciphertext"), or null when empty; everything else is plain text.
export type VaultCategory = {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  position: number;
  created_at: string;
};

export type VaultEntry = {
  id: string;
  user_id: string;
  category_id: string | null;
  name: string;
  url: string;
  username: string;
  password: string | null;
  api_key: string | null;
  note: string;
  position: number;
  created_at: string;
  updated_at: string;
};

export type VaultKey = {
  user_id: string;
  salt: string;
  iterations: number;
  check_value: string;
  created_at: string;
};
