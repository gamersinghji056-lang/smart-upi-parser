import type { ColumnMap, ColumnRole, RawRow } from "./types";
import { clean, parseAmount } from "./normalize";

interface RoleRule {
  role: ColumnRole;
  patterns: RegExp[];
}

/**
 * Universal header detection. No bank, template or column position is assumed:
 * we look for a row whose cells read like column labels and map them to roles.
 */
const RULES: RoleRule[] = [
  { role: "valueDate", patterns: [/value\s*date/i, /val\s*dt/i, /post(ing)?\s*date/i] },
  { role: "date", patterns: [/(txn|tran|transaction|book(ing)?)?\s*date/i, /^date$/i, /^dt\.?$/i] },
  {
    role: "narration",
    patterns: [/narration/i, /description/i, /particular/i, /remark/i, /details/i, /transaction\s*(info|remarks)/i],
  },
  { role: "reference", patterns: [/(ref|cheque|chq|utr|rrn)\s*(no|number|id)?/i, /reference/i] },
  { role: "debit", patterns: [/debit/i, /withdraw/i, /paid\s*out/i, /dr\s*amount/i, /^dr\.?$/i, /outgoing/i] },
  {
    role: "credit",
    patterns: [/credit/i, /deposit/i, /paid\s*in/i, /cr\s*amount/i, /^cr\.?$/i, /received/i, /incoming/i],
  },
  { role: "drcr", patterns: [/(dr|debit)\s*[/|-]\s*(cr|credit)/i, /(cr|credit)\s*[/|-]\s*(dr|debit)/i, /txn\s*type/i, /type/i, /indicator/i] },
  { role: "balance", patterns: [/balance/i, /bal\.?$/i] },
  { role: "amount", patterns: [/amount/i, /^amt\.?$/i, /value/i] },
];

/** Score a row on how much it looks like a header row. */
function headerScore(row: RawRow): { score: number; map: ColumnMap } {
  const map: ColumnMap = {};
  let score = 0;

  row.cells.forEach((cell, i) => {
    const value = clean(cell);
    if (!value || value.length > 40) return;
    if (parseAmount(value) !== null) return;
    for (const rule of RULES) {
      if (rule.patterns.some((p) => p.test(value))) {
        if (map[rule.role] === undefined) {
          map[rule.role] = i;
          score += 1;
        }
        return;
      }
    }
  });

  // A header row must at least identify a date plus one money-ish column.
  const hasMoney =
    map.credit !== undefined || map.debit !== undefined || map.amount !== undefined || map.balance !== undefined;
  if (map.date === undefined && map.valueDate === undefined) return { score: 0, map: {} };
  if (!hasMoney) return { score: 0, map: {} };
  return { score, map };
}

/**
 * Scans the first portion of the document for the best header row and returns
 * the resulting column map (empty when the layout has no usable header).
 */
export function detectColumns(rows: RawRow[]): { map: ColumnMap; headerIndex: number } {
  let best: { map: ColumnMap; headerIndex: number; score: number } = { map: {}, headerIndex: -1, score: 0 };
  const limit = Math.min(rows.length, 400);

  for (let i = 0; i < limit; i += 1) {
    const { score, map } = headerScore(rows[i]!);
    if (score > best.score) best = { map, headerIndex: i, score };
  }
  return { map: best.map, headerIndex: best.headerIndex };
}
