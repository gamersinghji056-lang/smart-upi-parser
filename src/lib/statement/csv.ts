import type { Transaction } from "./types";

function escapeCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: Transaction[]): string {
  const lines = ["Date,UTR,Amount,Mode"];
  for (const row of rows) {
    lines.push([row.date, row.utr, row.amount, row.mode].map(escapeCell).join(","));
  }
  return lines.join("\r\n");
}

export function csvFileName(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}_${p(date.getHours())}${p(
    date.getMinutes(),
  )}${p(date.getSeconds())}`;
  return `UPI_Credits_${stamp}.csv`;
}

/** Triggers a UTF-8 (BOM-prefixed) CSV download compatible with Excel/Sheets. */
export function downloadCsv(rows: Transaction[]): void {
  const blob = new Blob(["\uFEFF", toCsv(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = csvFileName();
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
