/** Generic, bank-agnostic text / number / date normalisation helpers. */

export function clean(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

/** Rows that are never transactions, regardless of bank. */
const NOISE_PATTERNS: RegExp[] = [
  /opening\s*balance/i,
  /closing\s*balance/i,
  /available\s*balance/i,
  /balance\s*(b\/?f|c\/?f|brought|carried)/i,
  /^\s*(b\/?f|c\/?f)\s*$/i,
  /total\s*(debit|credit|amount)?/i,
  /grand\s*total/i,
  /summary/i,
  /statement\s*(of|period|from)/i,
  /account\s*(number|no|holder|type|description|branch)/i,
  /customer\s*(id|name|no)/i,
  /nominee/i,
  /\bifsc\b/i,
  /\bmicr\b/i,
  /branch\s*(name|code|address)/i,
  /page\s*\d+\s*(of|\/)\s*\d+/i,
  /this\s+is\s+a\s+(computer|system)\s+generated/i,
  /registered\s+office/i,
  /generated\s+on/i,
};

export function isNoiseRow(text: string): boolean {
  if (!text) return true;
  return NOISE_PATTERNS.some((p) => p.test(text));
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const DATE_PATTERNS: RegExp[] = [
  /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/, // DD-MM-YYYY / DD/MM/YY
  /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/, // YYYY-MM-DD
  /\b(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s,]*(\d{2,4})\b/, // DD Mon YYYY / DD-MMM-YY
  /\b([A-Za-z]{3,9})[-\s](\d{1,2})[-\s,]*(\d{4})\b/, // Mon DD YYYY
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function fullYear(y: number): number {
  if (y >= 1000) return y;
  return y >= 70 ? 1900 + y : 2000 + y;
}

/** Parses any supported Indian statement date format into DD/MM/YYYY. */
export function parseDate(value: string): string | null {
  const text = clean(value);
  if (!text) return null;

  for (let i = 0; i < DATE_PATTERNS.length; i += 1) {
    const m = DATE_PATTERNS[i]!.exec(text);
    if (!m) continue;
    let d: number, mo: number, y: number;

    if (i === 0) {
      d = Number(m[1]);
      mo = Number(m[2]);
      y = fullYear(Number(m[3]));
      if (mo > 12 && d <= 12) [d, mo] = [mo, d];
    } else if (i === 1) {
      y = fullYear(Number(m[1]));
      mo = Number(m[2]);
      d = Number(m[3]);
    } else if (i === 2) {
      d = Number(m[1]);
      mo = MONTHS[m[2]!.slice(0, 3).toLowerCase()] ?? 0;
      y = fullYear(Number(m[3]));
    } else {
      mo = MONTHS[m[1]!.slice(0, 3).toLowerCase()] ?? 0;
      d = Number(m[2]);
      y = fullYear(Number(m[3]));
    }

    if (!mo || mo < 1 || mo > 12) continue;
    if (!d || d < 1 || d > 31) continue;
    if (y < 1900 || y > 2200) continue;
    return `${pad(d)}/${pad(mo)}/${y}`;
  }
  return null;
}

/** True when a date could be parsed out of the cell. */
export function looksLikeDate(value: string): boolean {
  return parseDate(value) !== null;
}

const AMOUNT_RE = /^-?(?:\d{1,3}(?:,\d{2,3})*|\d+)(?:\.\d{1,4})?$/;

/** Parses an Indian-formatted money cell. Returns null when not a number. */
export function parseAmount(value: string): number | null {
  let text = clean(value);
  if (!text) return null;
  text = text.replace(/(inr|rs\.?|₹)/gi, "").trim();

  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1).trim();
  }
  const suffix = /\b(cr|dr)\b\.?$/i.exec(text);
  if (suffix) text = text.slice(0, suffix.index).trim();
  if (/^[+-]/.test(text)) {
    negative = negative || text.startsWith("-");
    text = text.slice(1).trim();
  }
  if (!AMOUNT_RE.test(text)) return null;

  const num = Number(text.replace(/,/g, ""));
  if (!Number.isFinite(num)) return null;
  return negative ? -num : num;
}

export function formatAmount(value: number): string {
  return Math.abs(value).toFixed(2);
}
