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

// Reading section: categories are two levels deep (parent_id is null or a top-level category).
export type ArticleCategory = {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  position: number;
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
  read_at: string | null;
  created_at: string;
};

// What the reading page shows: an X post, the article's text, or nothing (open the original instead).
export type ArticleBlock = { type: "h" | "p" | "li" | "quote"; text: string };

export type ArticleContent =
  | { kind: "x"; postId: string }
  | { kind: "text"; blocks: ArticleBlock[] }
  | { kind: "none" };
