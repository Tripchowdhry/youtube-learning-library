// Video clips: pictures of the video frame placed into notes.
// Stored in the public "clips" Supabase Storage bucket under the owner's user id.

import type { SupabaseClient } from "@supabase/supabase-js";

export const CLIPS_BUCKET = "clips";
const MAX_WIDTH = 1280;

export type ClipImage = { blob: Blob; width: number; height: number };

// Shrinks a picture to at most 1280px wide and saves it as JPEG (usually 100-200 KB).
export async function compressImage(
  source: Blob | HTMLCanvasElement,
): Promise<ClipImage> {
  let canvas: HTMLCanvasElement;
  if (source instanceof HTMLCanvasElement) {
    canvas = source;
  } else {
    const bitmap = await createImageBitmap(source);
    canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    bitmap.close();
  }
  const scale = Math.min(1, MAX_WIDTH / canvas.width);
  const out = document.createElement("canvas");
  out.width = Math.round(canvas.width * scale);
  out.height = Math.round(canvas.height * scale);
  out.getContext("2d")!.drawImage(canvas, 0, 0, out.width, out.height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    out.toBlob(
      (b) =>
        b ? resolve(b) : reject(new Error("Couldn't create the picture")),
      "image/jpeg",
      0.82,
    ),
  );
  return { blob, width: out.width, height: out.height };
}

export async function uploadClip(
  supabase: SupabaseClient,
  image: ClipImage,
): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You're signed out. Sign in again to save clips.");
  const path = `${user.id}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from(CLIPS_BUCKET)
    .upload(path, image.blob, {
      contentType: "image/jpeg",
      cacheControl: "31536000",
    });
  if (error) throw new Error(error.message);
  return path;
}

export function clipUrl(supabase: SupabaseClient, path: string) {
  return supabase.storage.from(CLIPS_BUCKET).getPublicUrl(path).data.publicUrl;
}
