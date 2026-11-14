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

// A part of a file to show: a slide or a page of text (lines), or a sheet (rows of cells).
export type DocSection = { title?: string; lines?: string[]; rows?: string[][] };

async function slideSections(file: Blob): Promise<DocSection[]> {
  const files = await readZip(file, (n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  return [...files.keys()].sort(byNumber).map((name, i) => ({
    title: `Slide ${i + 1}`,
    lines: paragraphs(parse(files.get(name)!), "a:p", "a:t").split("\n").filter(Boolean),
  }));
}

async function sheetSections(file: Blob): Promise<DocSection[]> {
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
      const rows = Array.from(parse(files.get(name)!).getElementsByTagName("row")).map((row) => {
        // Cells carry their place (B3); empty ones are left out of the file, so put gaps back.
        const cells: string[] = [];
        for (const c of Array.from(row.getElementsByTagName("c"))) {
          const v = c.getElementsByTagName("v")[0]?.textContent ?? c.getElementsByTagName("t")[0]?.textContent ?? "";
          const col = columnIndex(c.getAttribute("r")) ?? cells.length;
          cells[col] = c.getAttribute("t") === "s" ? (shared[Number(v)] ?? "") : v;
        }
        return Array.from(cells, (x) => x ?? "");
      });
      return { title: `Sheet ${i + 1}`, rows: rows.filter((r) => r.some((x) => x.trim())) };
    });
}

function columnIndex(ref: string | null) {
  const letters = ref?.match(/^[A-Z]+/)?.[0];
  if (!letters) return undefined;
  return [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
}

// A simple CSV reader: commas, quotes and doubled quotes.
function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const endCell = () => {
    row.push(cell);
    cell = "";
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") endCell();
    else if (ch === "\n") endRow();
    else if (ch !== "\r") cell += ch;
  }
  if (cell || row.length) endRow();
  return rows.filter((r) => r.some((x) => x.trim()));
}

const asText = (sections: DocSection[]) =>
  sections
    .map((s) => [s.title, ...(s.lines ?? []), ...(s.rows ?? []).map((r) => r.join("\t"))].filter(Boolean).join("\n"))
    .join("\n\n");

const VIEWABLE = /\.(docx|pptx|xlsx|csv|txt|md)$/i;
export const hasTextView = (file: { name: string }) => VIEWABLE.test(file.name);

// The file's content, in parts, for showing on the page.
export async function docSections(file: File): Promise<DocSection[] | { error: string }> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  try {
    const sections =
      ext === "docx"
        ? [{ lines: (await wordText(file)).split("\n") }]
        : ext === "pptx"
          ? await slideSections(file)
          : ext === "xlsx"
            ? await sheetSections(file)
            : ext === "csv"
              ? [{ rows: csvRows(await file.text()) }]
              : [{ lines: (await file.text()).split("\n") }];
    if (!asText(sections).trim()) return { error: `"${file.name}" has no text to show (it may be only pictures).` };
    return sections;
  } catch {
    return { error: `"${file.name}" couldn't be read. Try saving it as a PDF and adding that.` };
  }
}

// The file's words as a text file for the AI, or an error to show.
export async function textForAi(file: File): Promise<File | { error: string }> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "csv") return new File([await file.text()], `${file.name}.txt`, { type: "text/plain" });
  const sections = await docSections(file);
  if (!Array.isArray(sections)) return sections;
  return new File([asText(sections)], `${file.name}.txt`, { type: "text/plain" });
}
