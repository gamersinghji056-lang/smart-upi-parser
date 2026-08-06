import type { ModeDefinition, ParseResult, RawRow, Transaction } from "./types";
import { StatementParseError } from "./types";
import { UPI_MODE } from "./modes";
import { detectColumns, isHeaderLikeRow } from "./columns";
import { balanceOfRow, extractFromRow } from "./rowEngine";
import { readPdf } from "./readers/pdf";
import { readTabular } from "./readers/tabular";
import { isNoiseRow, parseAmount, parseDate } from "./normalize";

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

/** A row that carries both a date and a money value is a real transaction line. */
function isTransactionLike(row: RawRow): boolean {
  const hasDate = row.cells.some((c) => parseDate(c) !== null);
  const hasMoney = row.cells.some((c) => {
    const value = parseAmount(c);
    return value !== null && /[.,]/.test(c);
  });
  return hasDate && hasMoney;
}

/**
 * PDF text layers wrap a single transaction across visual lines. Continuation
 * lines (no date, no money) are folded back into their transaction row — the
 * one above when it exists, otherwise the next one, since some banks print the
 * wrapped narration above its own amount line. Header lines are never folded,
 * so the column detector can still find the table header.
 */
function stitchWrappedRows(rows: RawRow[]): RawRow[] {
  const out: RawRow[] = [];
  let pending: RawRow[] = [];

  const flushInto = (target: RawRow) => {
    for (const held of pending) {
      target.cells.push(...held.cells);
      target.text = `${target.text} ${held.text}`.trim();
    }
    pending = [];
  };

  for (const row of rows) {
    const startsTransaction = row.cells.some((c) => parseDate(c) !== null);
    if (startsTransaction || isHeaderLikeRow(row)) {
      const copy: RawRow = { ...row, cells: [...row.cells] };
      if (startsTransaction) flushInto(copy);
      else pending = [];
      out.push(copy);
      continue;
    }

    const previous = out[out.length - 1];
    if (previous && isTransactionLike(previous)) {
      previous.cells.push(...row.cells);
      previous.text = `${previous.text} ${row.text}`.trim();
      continue;
    }
    if (!isNoiseRow(row.text) && pending.length < 3) pending.push(row);
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
  let prevBalance: number | null = null;

  rows.forEach((row) => {
    if (row.index === headerIndex) return;
    const txn = extractFromRow(row, map, mode, { prevBalance });
    if (txn) transactions.push(txn);
    const balance = balanceOfRow(row, map);
    if (balance !== null) prevBalance = balance;
  });

  return { transactions: dedupe(transactions), rowsScanned: rows.length, fileName: file.name };
}
