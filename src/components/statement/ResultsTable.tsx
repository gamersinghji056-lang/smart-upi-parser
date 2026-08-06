import { Download } from "lucide-react";
import type { Transaction } from "@/lib/statement/types";
import { downloadCsv, formatInr, totalVolume } from "@/lib/statement/csv";

export function ResultsTable({ rows }: { rows: Transaction[] }) {
  const volume = totalVolume(rows);
  return (
    <section className="panel overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-base font-semibold">UPI Credit transactions</h2>
          <p className="text-xs text-muted-foreground">
            {rows.length} {rows.length === 1 ? "row" : "rows"} extracted
          </p>
        </div>
        <button
          type="button"
          onClick={() => downloadCsv(rows)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Download className="size-4" />
          Download CSV
        </button>
      </header>

      <dl className="grid grid-cols-1 gap-px border-b border-border bg-border sm:grid-cols-2">
        <div className="bg-surface px-5 py-4">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Total transactions</dt>
          <dd className="mt-1 text-2xl font-semibold tabular">{rows.length}</dd>
        </div>
        <div className="bg-surface px-5 py-4">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Total UPI credit volume</dt>
          <dd className="mt-1 text-2xl font-semibold tabular">₹{formatInr(volume)}</dd>
        </div>
      </dl>


      <div className="max-h-[32rem] overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-surface text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="px-5 py-3 font-medium">Date</th>
              <th scope="col" className="px-5 py-3 font-medium">UTR</th>
              <th scope="col" className="px-5 py-3 text-right font-medium">Amount</th>
              <th scope="col" className="px-5 py-3 font-medium">Mode</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={`${row.utr}-${i}`} className="border-t border-border/70">
                <td className="whitespace-nowrap px-5 py-3 tabular">{row.date}</td>
                <td className="whitespace-nowrap px-5 py-3 font-mono text-xs tabular">{row.utr}</td>
                <td className="whitespace-nowrap px-5 py-3 text-right font-medium tabular">{row.amount}</td>
                <td className="px-5 py-3">
                  <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                    {row.mode}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
