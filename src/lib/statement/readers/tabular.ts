import type { RawRow } from "../types";
import { StatementParseError, clean } from "./shared";

/** Reads XLS / XLSX / CSV statements, one sheet row = one statement row. */
export async function readTabular(file: File): Promise<RawRow[]> {
  let XLSX: typeof import("xlsx");
  try {
    XLSX = await import("xlsx");
  } catch {
    throw new StatementParseError("Unable to read this bank statement.");
  }

  let workbook;
  try {
    const buffer = await file.arrayBuffer();
    workbook = XLSX.read(buffer, { type: "array", cellDates: true, raw: false });
  } catch {
    throw new StatementParseError("Unable to read this bank statement.");
  }

  const rows: RawRow[] = [];
  let index = 0;

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      blankrows: false,
      defval: "",
686: raw: false,
    } as never);

    for (const row of grid) {
      const cells = (row as unknown[]).map((c) => formatCell(c)).filter((c, i, arr) => !(c === "" && i === arr.length - 1));
      const text = cells.join(" ").trim();
      if (!text) continue;
      rows.push({ cells, text, source: name, index: index++ });
    }
  }

  if (rows.length === 0) throw new StatementParseError("Unable to read this bank statement.");
  return rows;
}

function formatCell(value: unknown): string {
  if (value instanceof Date) {
    const d = String(value.getDate()).padStart(2, "0");
    const m = String(value.getMonth() + 1).padStart(2, "0");
    return `${d}/${m}/${value.getFullYear()}`;
  }
  return clean(value);
}
