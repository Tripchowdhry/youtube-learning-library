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

export type NotePage = { strokes: NoteStroke[]; stamps: NoteStamp[]; images?: NoteImage[] };

// A clipped picture placed on a handwriting page, with the video time it came from.
export type NoteImage = { id: string; path: string; x: number; y: number; w: number; h: number; t: number };
