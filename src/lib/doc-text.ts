"use client";

// Word, PowerPoint and Excel files can't be read by the AI directly. Their words are pulled
// out here, on the person's computer, and sent to the AI as a plain text file instead.

const EXTRACTABLE = /\.(docx|pptx|xlsx|csv)$/i;

export const hasExtractableText = (file: { name: string }) => EXTRACTABLE.test(file.name);

// A .docx, .pptx or .xlsx is a zip of XML files. This reads the ones asked for, using the
// browser's own unzipping.
async function readZip(file: Blob, want: (name: string) => boolean): Promise<Map<string, string>> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(buf.buffer);
  // The central directory, listed at the end of the zip.
  let end = buf.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error("not a zip");
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const out = new Map<string, string>();
  const names = new TextDecoder();
  for (let i = 0; i < count; i++) {
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = names.decode(buf.subarray(at + 46, at + 46 + nameLen));
    at += 46 + nameLen + extraLen + commentLen;
    if (!want(name)) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = buf.subarray(start, start + size);
    const bytes =
      method === 0 ? raw : new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
    out.set(name, new TextDecoder().decode(bytes));
  }
  return out;
}

const parse = (xml: string) => new DOMParser().parseFromString(xml, "application/xml");
const byNumber = (a: string, b: string) => Number(a.match(/(\d+)\.xml$/)?.[1] ?? 0) - Number(b.match(/(\d+)\.xml$/)?.[1] ?? 0);

// The words of each paragraph, one paragraph per line.
function paragraphs(doc: Document, para: string, text: string) {
  return Array.from(doc.getElementsByTagName(para))
    .map((p) => Array.from(p.getElementsByTagName(text)).map((t) => t.textContent ?? "").join(""))
    .filter((line) => line.trim())
    .join("\n");
}

async function wordText(file: Blob) {
  const files = await readZip(file, (n) => n === "word/document.xml");
  const xml = files.get("word/document.xml");
  if (!xml) throw new Error("no document");
  // Tabs and line breaks inside a paragraph become spaces and new lines.
  return paragraphs(parse(xml.replace(/<w:tab\/>/g, "<w:t> </w:t>").replace(/<w:br\/>/g, "<w:t>\n</w:t>")), "w:p", "w:t");
}

async function slidesText(file: Blob) {
  const files = await readZip(file, (n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  return [...files.keys()]
    .sort(byNumber)
    .map((name, i) => `Slide ${i + 1}\n${paragraphs(parse(files.get(name)!), "a:p", "a:t")}`)
    .join("\n\n");
}

async function sheetText(file: Blob) {
  const files = await readZip(file, (n) => n === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const shared = files.has("xl/sharedStrings.xml")
    ? Array.from(parse(files.get("xl/sharedStrings.xml")!).getElementsByTagName("si")).map((si) =>
        Array.from(si.getElementsByTagName("t")).map((t) => t.textContent ?? "").join(""),
      )
    : [];
  return [...files.keys()]
    .filter((n) => n.includes("worksheets"))
    .sort(byNumber)
    .map((name, i) => {
      const rows = Array.from(parse(files.get(name)!).getElementsByTagName("row")).map((row) =>
        Array.from(row.getElementsByTagName("c"))
          .map((c) => {
            const v = c.getElementsByTagName("v")[0]?.textContent ?? c.getElementsByTagName("t")[0]?.textContent ?? "";
            return c.getAttribute("t") === "s" ? (shared[Number(v)] ?? "") : v;
          })
          .join("\t"),
      );
      return `Sheet ${i + 1}\n${rows.filter((r) => r.trim()).join("\n")}`;
    })
    .join("\n\n");
}

// The file's words as a text file for the AI, or an error to show.
export async function textForAi(file: File): Promise<File | { error: string }> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  try {
    const text =
      ext === "docx" ? await wordText(file) : ext === "pptx" ? await slidesText(file) : ext === "xlsx" ? await sheetText(file) : await file.text();
    if (!text.trim()) return { error: `"${file.name}" has no text the AI can read (it may be only pictures).` };
    return new File([text], `${file.name}.txt`, { type: "text/plain" });
  } catch {
    return { error: `The words in "${file.name}" couldn't be read. Try saving it as a PDF and adding that.` };
  }
}
