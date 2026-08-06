import type { ColumnMap, ModeDefinition, RawRow, Transaction } from "./types";
import { clean, formatAmount, isNoiseRow, parseAmount, parseDate } from "./normalize";
import { matchesMode } from "./modes";

const CREDIT_TOKENS =
  /\b(cr|credit|credited|credit\s*amount|credit\s*value|deposit|deposits|deposited|received|receive|recd|incoming|inward|by\s+transfer)\b/i;
const DEBIT_TOKENS =
  /\b(dr|debit|debited|debit\s*amount|withdraw(al|l|als|n)?|sent|paid|payment\s+to|outgoing|outward|to\s+transfer)\b/i;

type Direction = "credit" | "debit" | "unknown";

/** Per-document context (running balance) — never used to borrow row values. */
export interface RowContext {
  prevBalance?: number | null;
}

/** Merges every numeric cell in a row with its column index. */
interface NumericCell {
  index: number;
  value: number;
  raw: string;
}

function numericCells(row: RawRow): NumericCell[] {
  const out: NumericCell[] = [];
  row.cells.forEach((cell, index) => {
    const value = parseAmount(cell);
    if (value === null) return;
    // Ignore bare integers that are clearly identifiers, not money
    const raw = clean(cell);
    out.push({ index, value, raw });
  });
  return out;
}

function looksLikeMoney(raw: string): boolean {
  return /[.,]/.test(raw) || /\b(cr|dr)\b/i.test(raw);
}

/** Determines the transaction date (transaction date always wins over value date). */
function resolveDate(row: RawRow, map: ColumnMap): string | null {
  if (map.date !== undefined) {
    const d = parseDate(row.cells[map.date] ?? "");
    if (d) return d;
  }
  if (map.valueDate !== undefined) {
    const d = parseDate(row.cells[map.valueDate] ?? "");
    if (d) return d;
  }
  for (const cell of row.cells) {
    const d = parseDate(cell);
    if (d) return d;
  }
  return null;
}

/** Extracts the mode reference (UPI UTR) from within the same row only. */
function resolveReference(row: RawRow, mode: ModeDefinition): string | null {
  const primary: { value: string; score: number }[] = [];
  const fallback: { value: string; score: number }[] = [];

  row.cells.forEach((cell) => {
    const text = clean(cell);
    // Tokenise on anything that is not a digit so digit runs stand alone.
    const tokens = text.split(/[^0-9]+/).filter(Boolean);
    const cellHasMode = matchesMode(text, mode);

    tokens.forEach((token) => {
      const isPrimary = mode.referencePattern.test(token);
      const isFallback = !isPrimary && (mode.fallbackReferencePattern?.test(token) ?? false);
      if (!isPrimary && !isFallback) return;
      // Reject values that are actually a date-time stamp like 202512120930
      if (/^(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])/.test(token)) return;
      let score = 1;
      if (cellHasMode) score += 3;
      // A reference immediately adjacent to the mode keyword is the strongest signal.
      const near = new RegExp(`upi[^0-9a-z]{0,12}(?:[a-z0-9@.\\-]*[^0-9a-z]){0,6}${token}`, "i");
      if (near.test(text)) score += 2;
      (isPrimary ? primary : fallback).push({ value: token, score });
    });
  });

  const pool = primary.length > 0 ? primary : fallback;
  if (pool.length === 0) return null;
  pool.sort((a, b) => b.score - a.score);
  return pool[0]!.value;
}

/** The running balance of the row, used only to sanity-check the amount. */
function resolveBalance(row: RawRow, map: ColumnMap, nums: NumericCell[]): NumericCell | null {
  if (map.balance !== undefined) {
    const direct = nums.find((n) => n.index === map.balance);
    if (direct) return direct;
    // Merged / shifted spreadsheet cells: allow a one-column drift.
    const near = nums.find((n) => Math.abs(n.index - map.balance!) <= 1 && looksLikeMoney(n.raw));
    if (near) return near;
  }
  const money = nums.filter((n) => looksLikeMoney(n.raw));
  if (money.length > 1) return money[money.length - 1]!;
  return null;
}

/** Reads a mapped money column, tolerating a one-column drift from merged cells. */
function readMoneyColumn(
  index: number | undefined,
  nums: NumericCell[],
  balanceIndex: number | null,
  reserved: Set<number>,
): NumericCell | null {
  if (index === undefined) return null;
  const exact = nums.find((n) => n.index === index && Math.abs(n.value) > 0);
  if (exact) return exact;
  const drifted = nums.filter(
    (n) =>
      Math.abs(n.index - index) <= 1 &&
      n.index !== balanceIndex &&
      !reserved.has(n.index) &&
      Math.abs(n.value) > 0 &&
      looksLikeMoney(n.raw),
  );
  return drifted.length === 1 ? drifted[0]! : null;
}

/** Column indices owned by a role other than the one being read. */
function reservedIndices(map: ColumnMap, own: (keyof ColumnMap)[]): Set<number> {
  const set = new Set<number>();
  (Object.keys(map) as (keyof ColumnMap)[]).forEach((role) => {
    const index = map[role];
    if (index !== undefined && !own.includes(role)) set.add(index);
  });
  return set;
}

/** Decides credit vs debit using columns first, then row-level markers. */
function resolveDirectionAndAmount(
  row: RawRow,
  map: ColumnMap,
  nums: NumericCell[],
  ctx: RowContext,
): { direction: Direction; amount: number | null } {
  const balanceCell = resolveBalance(row, map, nums);
  const balanceIndex = balanceCell ? balanceCell.index : null;
  const marker = detectMarker(row, map);

  // 1. Explicit credit / debit (or deposit / withdrawal) columns.
  if (map.credit !== undefined || map.debit !== undefined) {
    const credit = readMoneyColumn(map.credit, nums, balanceIndex, reservedIndices(map, ["credit"]));
    const debit = readMoneyColumn(map.debit, nums, balanceIndex, reservedIndices(map, ["debit"]));
    if (credit && (!debit || credit.index !== debit.index)) {
      if (credit) return { direction: "credit", amount: Math.abs(credit.value) };
    }
    if (debit && (!credit || credit.index !== debit.index)) {
      return { direction: "debit", amount: Math.abs(debit.value) };
    }
  }



  // 2. Amount column plus a DR/CR indicator column or in-row marker.
  if (map.amount !== undefined && map.amount !== balanceIndex) {
    const amount = parseAmount(row.cells[map.amount] ?? "");
    if (amount !== null && amount !== 0) {
      if (marker !== "unknown") return { direction: marker, amount: Math.abs(amount) };
      if (amount > 0) return { direction: withBalance(ctx, balanceCell, amount, "credit"), amount };
      return { direction: "debit", amount: Math.abs(amount) };
    }
  }

  // 3. No usable header: infer from the money cells present in the row.
  const money = nums.filter((n) => n.index !== balanceIndex && looksLikeMoney(n.raw) && Math.abs(n.value) > 0);
  if (money.length === 0) return { direction: marker, amount: null };

  const chosen = money[money.length - 1]!;
  const amount = Math.abs(chosen.value);
  if (marker !== "unknown") return { direction: marker, amount };
  // 4. Last resort: a matching increase in the running balance means a credit.
  return { direction: withBalance(ctx, balanceCell, amount, "unknown"), amount };
}

/** Uses the balance movement between rows to classify an otherwise unknown row. */
function withBalance(
  ctx: RowContext,
  balanceCell: NumericCell | null,
  amount: number,
  fallback: Direction,
): Direction {
  const previous = ctx.prevBalance;
  if (previous === null || previous === undefined || !balanceCell) return fallback;
  const delta = Math.abs(balanceCell.value) - previous;
  if (Math.abs(delta - amount) <= 0.01) return "credit";
  if (Math.abs(delta + amount) <= 0.01) return "debit";
  return fallback;
}

function detectMarker(row: RawRow, map: ColumnMap): Direction {
  if (map.drcr !== undefined) {
    const value = clean(row.cells[map.drcr] ?? "");
    if (/^c(r|redit)?$/i.test(value) || CREDIT_TOKENS.test(value)) return "credit";
    if (/^d(r|ebit)?$/i.test(value) || DEBIT_TOKENS.test(value)) return "debit";
  }
  for (const cell of row.cells) {
    const value = clean(cell);
    if (/^c(r|redit)?\.?$/i.test(value)) return "credit";
    if (/^d(r|ebit)?\.?$/i.test(value)) return "debit";
  }
  const debit = DEBIT_TOKENS.test(row.text);
  const credit = CREDIT_TOKENS.test(row.text);
  if (credit && !debit) return "credit";
  if (debit && !credit) return "debit";
  return "unknown";
}

/** The row's running balance, exposed so the document loop can track it. */
export function balanceOfRow(row: RawRow, map: ColumnMap): number | null {
  const cell = resolveBalance(row, map, numericCells(row));
  return cell ? Math.abs(cell.value) : null;
}

/**
 * Processes a single statement row independently and returns a transaction
 * when — and only when — every validation rule passes.
 */
export function extractFromRow(
  row: RawRow,
  map: ColumnMap,
  mode: ModeDefinition,
  ctx: RowContext = {},
): Transaction | null {
  if (isNoiseRow(row.text)) return null;
  if (!matchesMode(row.text, mode)) return null;
  if (mode.accept && !mode.accept(row)) return null;

  const date = resolveDate(row, map);
  if (!date) return null;

  const utr = resolveReference(row, mode);
  if (!utr) return null;

  const nums = numericCells(row);
  const { direction, amount } = resolveDirectionAndAmount(row, map, nums, ctx);
  if (amount === null || amount === 0) return null;
  if (direction !== "credit") return null;
  // A reference number mistaken for money is never a valid amount.
  if (String(Math.round(amount)) === String(Number(utr))) return null;

  return { date, utr, amount: formatAmount(amount), mode: mode.id };
}
