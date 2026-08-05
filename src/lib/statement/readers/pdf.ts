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
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  } catch {
    throw new StatementParseError("Unable to read this bank statement.");
  }

  let doc;
  try {
    const buffer = await file.arrayBuffer();
    doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false }).promise;
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
        const cells = clusterCells(line);
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
function clusterCells(line: Item[]): string[] {
  const cells: string[] = [];
  let buffer = line[0] ? line[0].str : "";
  for (let i = 1; i < line.length; i += 1) {
    const prev = line[i - 1]!;
    const item = line[i]!;
    const gap = item.x - (prev.x + prev.w);
    if (gap > 6) {
      cells.push(buffer.trim());
      buffer = item.str;
    } else {
      buffer += (gap > 0.8 ? " " : "") + item.str;
    }
  }
  if (buffer.trim()) cells.push(buffer.trim());
  return cells.filter((c) => c.length > 0);
}
