import type { ModeDefinition, ParseResult, RawRow, Transaction } from "./types";
import { StatementParseError } from "./types";
import { UPI_MODE } from "./modes";
import { detectColumns } from "./columns";
import { extractFromRow } from "./rowEngine";
import { readPdf } from "./readers/pdf";
import { readTabular } from "./readers/tabular";
import { parseDate } from "./normalize";

export const ACCEPTED_EXTENSIONS = [".pdf", ".csv", ".xls", ".xlsx"];

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

async function readRows(file: File): Promise<RawRow[]> {
  const ext = extensionOf(file.name);
  if (ext === ".pdf") return stitchWrappedRows(await readPdf(file));
  if (ext === ".csv" || ext === ".xls" || ext === ".xlsx") return readTabular(file);
  throw new StatementParseError("Unsupported file type. Upload a PDF, XLS, XLSX or CSV statement.");
}

/**
 * PDF text layers wrap a single transaction across visual lines. Continuation
 * lines (no date, no money) are folded back into their parent transaction row
 * so that one transaction always remains exactly one row.
 */
function stitchWrappedRows(rows: RawRow[]): RawRow[] {
  const out: RawRow[] = [];
  for (const row of rows) {
    const startsTransaction = row.cells.some((c) => parseDate(c) !== null);
    if (startsTransaction || out.length === 0) {
      out.push({ ...row, cells: [...row.cells] });
      continue;
    }
    const previous = out[out.length - 1]!;
    previous.cells.push(...row.cells);
    previous.text = `${previous.text} ${row.text}`.trim();
  }
  return out;
}

function dedupe(items: Transaction[]): Transaction[] {
  const seen = new Set<string>();
  return items.filter((t) => {
    const key = `${t.date}|${t.utr}|${t.amount}|${t.mode}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Universal entry point. Reads any supported statement file and returns the
 * transactions matching the requested mode (UPI credits by default).
 */
export async function parseStatement(file: File, mode: ModeDefinition = UPI_MODE): Promise<ParseResult> {
  const rows = await readRows(file);
  const { map, headerIndex } = detectColumns(rows);

  const transactions: Transaction[] = [];
  rows.forEach((row) => {
    if (row.index === headerIndex) return;
    const txn = extractFromRow(row, map, mode);
    if (txn) transactions.push(txn);
  });

  return { transactions: dedupe(transactions), rowsScanned: rows.length, fileName: file.name };
}
