/**
 * Core types for the Universal Indian Bank Statement Intelligence Engine.
 * These are intentionally bank-agnostic: the engine only ever sees generic
 * rows of cells, never a bank-specific shape.
 */

/** A single physical row of a statement, split into cells (columns). */
export interface RawRow {
  /** Ordered cell values, left to right. */
  cells: string[];
  /** Whole row flattened to a single searchable string. */
  text: string;
  /** Source page / sheet index (for diagnostics only). */
  source: string;
  /** Original ordinal position across the whole document. */
  index: number;
}

/** Column roles the universal header detector can recognise. */
export type ColumnRole =
  | "date"
  | "valueDate"
  | "narration"
  | "reference"
  | "debit"
  | "credit"
  | "amount"
  | "drcr"
  | "balance";

export type ColumnMap = Partial<Record<ColumnRole, number>>;

/** A normalised transaction extracted from a row. */
export interface Transaction {
  date: string;
  utr: string;
  amount: string;
  mode: string;
}

/** Pluggable transaction-mode definition (UPI today, IMPS/NEFT/RTGS later). */
export interface ModeDefinition {
  /** Display label used in the Mode column. */
  id: string;
  /** Case-insensitive patterns; a row is a candidate if any matches. */
  keywords: RegExp[];
  /** Reference-number validator (e.g. 12 digits for UPI UTR). */
  referencePattern: RegExp;
  /** Optional extra guard applied to a candidate row. */
  accept?: (row: RawRow) => boolean;
}

export interface ParseResult {
  transactions: Transaction[];
  rowsScanned: number;
  fileName: string;
}

export class StatementParseError extends Error {}
