import { previewCard, previewSize } from "@/lib/preview-card";
import { reportLinkPreview } from "@/lib/shared-preview";

export const size = previewSize;
export const contentType = "image/png";
export const alt = "A report shared from BrainShelf";

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  return previewCard(await reportLinkPreview((await params).token));
}
