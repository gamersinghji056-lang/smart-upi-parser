import type { RawRow } from "../types";
import { StatementParseError, clean } from "./shared";
import { parseDate } from "../normalize";

interface Item {
  str: string;
  x: number;
  y: number;
  w: number;
}

const UNREADABLE = "Unable to read this bank statement.";
const ENCRYPTED =
  "This PDF is password protected. Please upload the unlocked / original bank statement.";
const CORRUPTED = "This PDF appears to be corrupted or invalid. Please re-download it from your bank.";
const NO_TEXT =
  "This PDF has no readable text layer (it looks scanned). Please upload the original bank-generated PDF.";

function toFriendlyError(err: unknown): StatementParseError {
  const name = (err as { name?: string } | null)?.name ?? "";
  const message = String((err as { message?: string } | null)?.message ?? "");
  if (name === "PasswordException" || /password/i.test(message)) return new StatementParseError(ENCRYPTED);
  if (name === "InvalidPDFException" || /invalid pdf|corrupt/i.test(message))
    return new StatementParseError(CORRUPTED);
  return new StatementParseError(UNREADABLE);
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
    throw new StatementParseError(UNREADABLE);
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
  } catch (err) {
    throw toFriendlyError(err);
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

      const lines = clusterRows(items).map((line) => clusterCells(line)).filter((c) => c.length > 0);
      // Column bands are learned from the page's own transaction lines, so the
      // grid follows where the values actually sit rather than where a header
      // label happens to start (labels are often centred over their column).
      const bands = buildBands(lines);

      for (const chunks of lines) {
        const cells = bands.length >= 3 ? snapToBands(chunks, bands) : chunks.map((c) => c.text);
        const text = cells.join(" ").trim();
        if (!text) continue;
        rows.push({ cells, text, source: `page ${p}`, index: index++ });
      }
    }
  } catch (err) {
    throw toFriendlyError(err);
  }

  if (rows.length === 0) throw new StatementParseError(NO_TEXT);
  return rows;
}

interface Chunk {
  text: string;
  x: number;
  end: number;
}

type Band = { start: number; end: number };

/** A line that carries a date is a transaction line: it defines the real grid. */
function isDataLine(chunks: Chunk[]): boolean {
  if (chunks.length < 3) return false;
  return chunks.some((c) => c.text.length <= 30 && parseDate(c.text) !== null);
}

const BAND_GAP = 3;

function buildBands(lines: Chunk[][]): Band[] {
  const spans: Band[] = [];
  for (const line of lines) {
    if (!isDataLine(line)) continue;
    for (const c of line) spans.push({ start: c.x, end: Math.max(c.end, c.x + 1) });
  }
  if (spans.length === 0) return [];
  spans.sort((a, b) => a.start - b.start);

  const bands: Band[] = [{ ...spans[0]! }];
  for (const span of spans.slice(1)) {
    const last = bands[bands.length - 1]!;
    if (span.start <= last.end + BAND_GAP) {
      last.end = Math.max(last.end, span.end);
    } else {
      bands.push({ ...span });
    }
  }
  return bands;
}

/** Places chunks into the learned column bands by overlap, then by distance. */
function snapToBands(chunks: Chunk[], bands: Band[]): string[] {
  const slots: string[] = bands.map(() => "");
  for (const chunk of chunks) {
    let best = 0;
    let bestOverlap = 0;
    let bestDistance = Infinity;
    bands.forEach((band, i) => {
      const overlap = Math.max(0, Math.min(chunk.end, band.end) - Math.max(chunk.x, band.start));
      const distance =
        overlap > 0 ? 0 : Math.min(Math.abs(chunk.x - band.end), Math.abs(band.start - chunk.end));
      if (overlap > bestOverlap || (bestOverlap === 0 && distance < bestDistance)) {
        bestOverlap = Math.max(bestOverlap, overlap);
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
