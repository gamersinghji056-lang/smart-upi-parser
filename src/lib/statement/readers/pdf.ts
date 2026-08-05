import type { RawRow } from "../types";
import { StatementParseError, clean } from "./shared";

interface Item {
  str: string;
  x: number;
  y: number;
  w: number;
}

/**
 * Extracts text from an original (digital) bank PDF while preserving the table
 * structure: items are clustered by baseline into rows, then by horizontal gap
 * into cells. No OCR, no rasterisation, no flattening into one long string.
 */
export async function readPdf(file: File): Promise<RawRow[]> {
  let pdfjs: typeof import("pdfjs-dist");
  try {
    pdfjs = await import("pdfjs-dist");
  } catch {
    throw new StatementParseError("Unable to read this bank statement.");
  }
  try {
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  } catch {
    // Falls back to pdf.js' bundled/inline worker resolution.
  }

  let doc;
  try {
    const buffer = await file.arrayBuffer();
    doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  } catch {
    throw new StatementParseError("Unable to read this bank statement.");
  }

  const rows: RawRow[] = [];
  let index = 0;

  try {
    for (let p = 1; p <= doc.numPages; p += 1) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const items: Item[] = [];

      for (const raw of content.items) {
        const item = raw as { str?: string; transform?: number[]; width?: number };
        const str = clean(item.str);
        if (!str || !item.transform) continue;
        items.push({
          str,
          x: item.transform[4] ?? 0,
          y: item.transform[5] ?? 0,
          w: item.width ?? 0,
        });
      }

      for (const line of clusterRows(items)) {
        const chunks = clusterCells(line);
        if (chunks.length === 0) continue;

        // Lock onto the page's column grid the first time a header-like line
        // appears, then snap every following row into those same columns.
        if (isHeaderLine(chunks)) grid = chunks.map((c) => c.x);
        const cells = grid ? snapToGrid(chunks, grid) : chunks.map((c) => c.text);

        const text = cells.join(" ").trim();
        if (!text) continue;
        rows.push({ cells, text, source: `page ${p}`, index: index++ });
      }
    }
  } catch {
    throw new StatementParseError("Unable to read this bank statement.");
  }

  if (rows.length === 0) throw new StatementParseError("Unable to read this bank statement.");
  return rows;
}

interface Chunk {
  text: string;
  x: number;
  end: number;
}

const HEADER_HINTS = [
  /date/i,
  /narration|description|particular|remark|detail/i,
  /debit|withdraw/i,
  /credit|deposit/i,
  /balance/i,
  /amount/i,
];

function isHeaderLine(chunks: Chunk[]): boolean {
  if (chunks.length < 3) return false;
  const hits = HEADER_HINTS.filter((h) => chunks.some((c) => h.test(c.text) && c.text.length <= 40));
  const hasDate = chunks.some((c) => /date/i.test(c.text));
  return hasDate && hits.length >= 3;
}

/** Places chunks into the detected column slots by horizontal overlap. */
function snapToGrid(chunks: Chunk[], grid: number[]): string[] {
  const slots: string[] = grid.map(() => "");
  for (const chunk of chunks) {
    const center = (chunk.x + chunk.end) / 2;
    let best = 0;
    let bestDistance = Infinity;
    grid.forEach((start, i) => {
      const nextStart = grid[i + 1] ?? Infinity;
      const inside = chunk.x >= start - 4 && center < nextStart;
      const distance = inside ? 0 : Math.min(Math.abs(chunk.x - start), Math.abs(center - start));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    });
    slots[best] = slots[best] ? `${slots[best]} ${chunk.text}` : chunk.text;
  }
  return slots;
}

/** Groups items sharing (approximately) the same baseline into one row. */
function clusterRows(items: Item[]): Item[][] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Item[][] = [];
  let current: Item[] = [sorted[0]!];
  let baseline = sorted[0]!.y;

  for (let i = 1; i < sorted.length; i += 1) {
    const item = sorted[i]!;
    if (Math.abs(item.y - baseline) <= 3) {
      current.push(item);
    } else {
      lines.push(current);
      current = [item];
      baseline = item.y;
    }
  }
  lines.push(current);
  return lines.map((line) => line.sort((a, b) => a.x - b.x));
}

/** Splits a row's items into cells using horizontal whitespace gaps. */
function clusterCells(line: Item[]): Chunk[] {
  const chunks: Chunk[] = [];
  if (line.length === 0) return chunks;

  let buffer = line[0]!.str;
  let start = line[0]!.x;
  let end = line[0]!.x + line[0]!.w;

  for (let i = 1; i < line.length; i += 1) {
    const prev = line[i - 1]!;
    const item = line[i]!;
    const gap = item.x - (prev.x + prev.w);
    if (gap > 6) {
      if (buffer.trim()) chunks.push({ text: buffer.trim(), x: start, end });
      buffer = item.str;
      start = item.x;
    } else {
      buffer += (gap > 0.8 ? " " : "") + item.str;
    }
    end = item.x + item.w;
  }
  if (buffer.trim()) chunks.push({ text: buffer.trim(), x: start, end });
  return chunks;
}
