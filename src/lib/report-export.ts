// Getting a report out of BrainShelf: copy it (keeps headings, lists, links and pictures when
// pasted into Word, Google Docs or an email) or download it as a Word file.

import type { Block, Inline } from "@/lib/report";
import { fileName, parseReport } from "@/lib/report";

type Resolve = (src: string) => string;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inlineHtml(parts: Inline[]) {
  return parts
    .map((p) => {
      let html = escapeHtml(p.text);
      if (p.bold) html = `<strong>${html}</strong>`;
      if (p.href) html = `<a href="${escapeHtml(p.href)}">${html}</a>`;
      return html;
    })
    .join("");
}

export function reportHtml(blocks: Block[], resolve: Resolve) {
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const b of blocks) {
    const want = b.type === "li" ? "ul" : b.type === "ol" ? "ol" : null;
    if (want !== list) {
      closeList();
      if (want) out.push(want === "ol" && b.type === "ol" ? `<ol start="${b.num}">` : "<ul>");
      list = want;
    }
    if (b.type === "img") {
      out.push(`<p><img src="${escapeHtml(resolve(b.src))}" alt="${escapeHtml(b.caption)}" style="max-width:600px;width:100%">`);
      if (b.caption) out.push(`<br><em>${escapeHtml(b.caption)}</em>`);
      out.push("</p>");
    } else if (b.type === "li" || b.type === "ol") {
      out.push(`<li>${inlineHtml(b.inline)}</li>`);
    } else if (b.type === "quote") {
      out.push(`<blockquote>${inlineHtml(b.inline)}</blockquote>`);
    } else {
      out.push(`<${b.type}>${inlineHtml(b.inline)}</${b.type}>`);
    }
  }
  closeList();
  return out.join("\n");
}

// Plain text for apps that don't take formatting: markdown marks removed, pictures as links.
export function reportPlainText(blocks: Block[], resolve: Resolve) {
  const text = (parts: Inline[]) =>
    parts.map((p) => (p.href && p.href !== p.text ? `${p.text} (${p.href})` : p.text)).join("");
  return blocks
    .map((b) => {
      if (b.type === "img") return `[Picture${b.caption ? `, ${b.caption}` : ""}: ${resolve(b.src)}]`;
      if (b.type === "li") return `- ${text(b.inline)}`;
      if (b.type === "ol") return `${b.num}. ${text(b.inline)}`;
      if (b.type === "h1" || b.type === "h2") return `\n${text(b.inline).toUpperCase()}`;
      return text(b.inline);
    })
    .join("\n")
    .trim();
}

export async function copyReport(body: string, resolve: Resolve) {
  const blocks = parseReport(body);
  const html = reportHtml(blocks, resolve);
  const plain = reportPlainText(blocks, resolve);
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
      return;
    } catch {
      // Some browsers only allow plain text.
    }
  }
  await navigator.clipboard.writeText(plain);
}

// ---------- Word ----------

// A picture for Word: JPEG or PNG bytes and a size that fits the page (about 6 inches wide).
async function wordPicture(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("picture missing");
  let blob = await res.blob();
  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;
  if (blob.type !== "image/jpeg" && blob.type !== "image/png") {
    // Word can't show WebP and some others, so they're redrawn as PNG.
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("picture"))), "image/png"),
    );
  }
  bitmap.close();
  const scale = Math.min(1, 576 / width);
  return {
    data: await blob.arrayBuffer(),
    type: blob.type === "image/png" ? ("png" as const) : ("jpg" as const),
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

export async function downloadWord(title: string, body: string, resolve: Resolve) {
  // Loaded only when someone downloads, so the rest of the app never carries it.
  const docx = await import("docx");
  const { AlignmentType, Document, ExternalHyperlink, HeadingLevel, ImageRun, LevelFormat, Packer, Paragraph, TextRun } = docx;

  const runs = (parts: Inline[]) =>
    parts.map((p) =>
      p.href
        ? new ExternalHyperlink({ link: p.href, children: [new TextRun({ text: p.text, bold: p.bold, style: "Hyperlink" })] })
        : new TextRun({ text: p.text, bold: p.bold }),
    );

  const children: InstanceType<typeof Paragraph>[] = [];
  // Each numbered list starts again from 1.
  let listInstance = 0;
  let previous: Block["type"] | null = null;
  for (const b of parseReport(body)) {
    if (b.type === "img") {
      try {
        const pic = await wordPicture(resolve(b.src));
        children.push(
          new Paragraph({
            children: [new ImageRun({ type: pic.type, data: pic.data, transformation: { width: pic.width, height: pic.height } })],
          }),
        );
      } catch {
        children.push(new Paragraph({ children: [new TextRun({ text: `[Picture: ${resolve(b.src)}]`, italics: true })] }));
      }
      if (b.caption) children.push(new Paragraph({ children: [new TextRun({ text: b.caption, italics: true, size: 18 })] }));
    } else if (b.type === "h1") {
      children.push(new Paragraph({ heading: HeadingLevel.TITLE, children: runs(b.inline) }));
    } else if (b.type === "h2") {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: runs(b.inline) }));
    } else if (b.type === "h3") {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: runs(b.inline) }));
    } else if (b.type === "li") {
      children.push(new Paragraph({ bullet: { level: 0 }, children: runs(b.inline) }));
    } else if (b.type === "ol") {
      if (previous !== "ol") listInstance += 1;
      children.push(new Paragraph({ numbering: { reference: "steps", level: 0, instance: listInstance }, children: runs(b.inline) }));
    } else if (b.type === "quote") {
      children.push(new Paragraph({ indent: { left: 720 }, children: runs(b.inline) }));
    } else {
      children.push(new Paragraph({ children: runs(b.inline), spacing: { after: 120 } }));
    }
    previous = b.type;
  }

  const doc = new Document({
    title,
    creator: "BrainShelf",
    numbering: {
      config: [
        {
          reference: "steps",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.START,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileName(title)}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
