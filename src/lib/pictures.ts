// Shrinks pictures before they're stored, so they take a fraction of the space with no visible
// difference on screen. WebP where the browser can make it (Chrome, Edge, Firefox, recent
// Safari); JPEG otherwise.

export type ShrunkPicture = { blob: Blob; width: number; height: number; type: "image/webp" | "image/jpeg"; ext: "webp" | "jpg" };

const QUALITY = 0.82;

function encode(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, QUALITY));
}

// At most `maxWidth` pixels wide; smaller pictures keep their size.
export async function shrinkPicture(source: Blob, maxWidth: number): Promise<ShrunkPicture> {
  const bitmap = await createImageBitmap(source);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d")!;
  const draw = () => ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  try {
    draw();
    // A browser that can't make WebP quietly hands back a PNG instead.
    const webp = await encode(canvas, "image/webp");
    if (webp?.type === "image/webp") return { blob: webp, width: canvas.width, height: canvas.height, type: "image/webp", ext: "webp" };
    // JPEG has no see-through parts, so put the picture on white first.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    draw();
    const jpeg = await encode(canvas, "image/jpeg");
    if (!jpeg) throw new Error("Couldn't create the picture");
    return { blob: jpeg, width: canvas.width, height: canvas.height, type: "image/jpeg", ext: "jpg" };
  } finally {
    bitmap.close();
  }
}
