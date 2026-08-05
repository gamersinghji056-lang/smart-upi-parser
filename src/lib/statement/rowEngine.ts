import type { ColumnMap, ModeDefinition, RawRow, Transaction } from "./types";
import { clean, formatAmount, isNoiseRow, parseAmount, parseDate } from "./normalize";
import { matchesMode } from "./modes";

const CREDIT_TOKENS =
  /\b(cr|credit|credited|deposit|deposited|received|receive|incoming|inward|by\s+transfer)\b/i;
const DEBIT_TOKENS =
  /\b(dr|debit|debited|withdraw(al|n)?|sent|paid|payment\s+to|outgoing|outward|to\s+transfer)\b/i;

type Direction = "credit" | "debit" | "unknown";

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
  const candidates: { value: string; score: number }[] = [];

  row.cells.forEach((cell) => {
    const text = clean(cell);
    // Tokenise on anything that is not a digit so 12-digit runs stand alone.
    const tokens = text.split(/[^0-9]+/).filter(Boolean);
    const cellHasMode = matchesMode(text, mode);

    tokens.forEach((token) => {
      if (!mode.referencePattern.test(token)) return;
      // Reject values that are actually a date-time stamp like 202512120930
      if (/^(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])/.test(token)) return;
      let score = 1;
      if (cellHasMode) score += 3;
      // A reference immediately adjacent to the mode keyword is the strongest signal.
      const near = new RegExp(`upi[^0-9a-z]{0,12}(?:[a-z0-9@.\\-]*[^0-9a-z]){0,6}${token}`, "i");
      if (near.test(text)) score += 2;
      candidates.push({ value: token, score });
    });
  });

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]!.value;
}

/** Decides credit vs debit using columns first, then row-level markers. */
function resolveDirectionAndAmount(
  row: RawRow,
  map: ColumnMap,
  nums: NumericCell[],
): { direction: Direction; amount: number | null } {
  const balanceIndex = map.balance;

  // 1. Explicit credit / debit columns.
  if (map.credit !== undefined || map.debit !== undefined) {
    const credit = map.credit !== undefined ? parseAmount(row.cells[map.credit] ?? "") : null;
    const debit = map.debit !== undefined ? parseAmount(row.cells[map.debit] ?? "") : null;
    if (credit !== null && Math.abs(credit) > 0) return { direction: "credit", amount: Math.abs(credit) };
    if (debit !== null && Math.abs(debit) > 0) return { direction: "debit", amount: Math.abs(debit) };
  }

  // 2. Amount column plus a DR/CR indicator column or in-row marker.
  const marker = detectMarker(row, map);
  if (map.amount !== undefined) {
    const amount = parseAmount(row.cells[map.amount] ?? "");
    if (amount !== null && amount !== 0) {
      if (marker !== "unknown") return { direction: marker, amount: Math.abs(amount) };
      if (amount > 0) return { direction: "credit", amount };
      return { direction: "debit", amount: Math.abs(amount) };
    }
  }

  // 3. No usable header: infer from the money cells present in the row.
  const money = nums.filter((n) => n.index !== balanceIndex && looksLikeMoney(n.raw) && Math.abs(n.value) > 0);
  if (money.length === 0) return { direction: marker, amount: null };

  // The balance is conventionally the last money value on the row.
  const withoutBalance = money.length > 1 ? money.slice(0, -1) : money;
  const chosen = withoutBalance[withoutBalance.length - 1]!;
  return { direction: marker, amount: Math.abs(chosen.value) };
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

/**
 * Processes a single statement row independently and returns a transaction
 * when — and only when — every validation rule passes.
 */
export function extractFromRow(row: RawRow, map: ColumnMap, mode: ModeDefinition): Transaction | null {
  if (isNoiseRow(row.text)) return null;
  if (!matchesMode(row.text, mode)) return null;
  if (mode.accept && !mode.accept(row)) return null;

  const date = resolveDate(row, map);
  if (!date) return null;

  const utr = resolveReference(row, mode);
  if (!utr) return null;

  const nums = numericCells(row);
  const { direction, amount } = resolveDirectionAndAmount(row, map, nums);
  if (amount === null || amount === 0) return null;
  if (direction !== "credit") return null;

  return { date, utr, amount: formatAmount(amount), mode: mode.id };
}
