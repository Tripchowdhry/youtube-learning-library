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
