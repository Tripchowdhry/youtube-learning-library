// Video clips: pictures of the video frame placed into notes.
// Stored in the public "clips" Supabase Storage bucket under the owner's user id.

import type { SupabaseClient } from "@supabase/supabase-js";

export const CLIPS_BUCKET = "clips";
const MAX_WIDTH = 1280;

export type ClipImage = { blob: Blob; width: number; height: number };

// Shrinks a picture to at most 1280px wide and saves it as JPEG (usually 100-200 KB).
export async function compressImage(source: Blob | HTMLCanvasElement): Promise<ClipImage> {
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
    out.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't create the picture"))), "image/jpeg", 0.82),
  );
  return { blob, width: out.width, height: out.height };
}

export async function uploadClip(supabase: SupabaseClient, image: ClipImage): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You're signed out. Sign in again to save clips.");
  const path = `${user.id}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from(CLIPS_BUCKET)
    .upload(path, image.blob, { contentType: "image/jpeg", cacheControl: "31536000" });
  if (error) throw new Error(error.message);
  return path;
}

export function clipUrl(supabase: SupabaseClient, path: string) {
  return supabase.storage.from(CLIPS_BUCKET).getPublicUrl(path).data.publicUrl;
}

export function canCaptureScreen() {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;
}

// Grabs the current frame of an on-screen element by capturing this browser tab
// (YouTube doesn't let pages read its video pixels directly). The browser asks for
// permission the first time; the same stream is reused for later clips.
export class TabCapture {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;

  get active() {
    return !!this.stream && this.stream.getVideoTracks().some((t) => t.readyState === "live");
  }

  private async start() {
    const options = {
      video: { displaySurface: "browser", frameRate: 5 },
      audio: false,
      preferCurrentTab: true,
      selfBrowserSurface: "include",
    } as DisplayMediaStreamOptions;
    this.stream = await navigator.mediaDevices.getDisplayMedia(options);
    this.video = document.createElement("video");
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.srcObject = this.stream;
    await this.video.play();
    // Give the first frames a moment to arrive.
    await new Promise((r) => setTimeout(r, 400));
    this.stream.getVideoTracks()[0]?.addEventListener("ended", () => this.stop());
  }

  async grab(element: HTMLElement): Promise<HTMLCanvasElement> {
    if (!this.active) await this.start();
    const video = this.video!;
    // Wait for a fresh frame so we don't capture a stale picture.
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 150)));
    const rect = element.getBoundingClientRect();
    const scaleX = video.videoWidth / window.innerWidth;
    const scaleY = video.videoHeight / window.innerHeight;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(rect.width * scaleX);
    canvas.height = Math.round(rect.height * scaleY);
    canvas
      .getContext("2d")!
      .drawImage(
        video,
        rect.left * scaleX,
        rect.top * scaleY,
        rect.width * scaleX,
        rect.height * scaleY,
        0,
        0,
        canvas.width,
        canvas.height,
      );
    return canvas;
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
    this.video = null;
  }
}
