import { previewCard, previewSize } from "@/lib/preview-card";
import { shareLinkPreview } from "@/lib/shared-preview";

export const size = previewSize;
export const contentType = "image/png";
export const alt = "A category shared from BrainShelf";

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  return previewCard(await shareLinkPreview((await params).token));
}
