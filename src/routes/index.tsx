import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck, Cpu, TableProperties, AlertCircle } from "lucide-react";
import { UploadPanel } from "@/components/statement/UploadPanel";
import { ResultsTable } from "@/components/statement/ResultsTable";
import { parseStatement } from "@/lib/statement/parseStatement";
import { StatementParseError, type Transaction } from "@/lib/statement/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "UPI Credit Extractor — Indian Bank Statement Engine" },
      {
        name: "description",
        content:
          "Upload any Indian bank statement (PDF, XLS, XLSX, CSV) and instantly extract every UPI credit with date, UTR and amount. Export to CSV.",
      },
      { property: "og:title", content: "UPI Credit Extractor — Indian Bank Statement Engine" },
      {
        property: "og:description",
        content:
          "Universal parser that pulls UPI credit transactions from any Indian bank statement. No templates, no bank selection.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const FEATURES = [
  { icon: Cpu, title: "One universal parser", body: "No bank names, templates or fixed column positions." },
  { icon: TableProperties, title: "Structure preserved", body: "Real PDF text layout parsing — no OCR, no flattening." },
  { icon: ShieldCheck, title: "Stays on your device", body: "Statements are parsed in your browser, never uploaded." },
];

function Index() {
  const [rows, setRows] = useState<Transaction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    setRows(null);
    setFileName(file.name);
    try {
      const result = await parseStatement(file);
      if (result.transactions.length === 0) {
        setError("No UPI Credit transactions found.");
      } else {
        setRows(result.transactions);
      }
    } catch (err) {
      setError(
        err instanceof StatementParseError ? err.message : "Unable to read this bank statement.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen">
      <div className="bg-gradient-ink px-6 pb-24 pt-16 text-primary-foreground">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-block rounded-full border border-primary-foreground/25 px-3 py-1 text-xs font-medium uppercase tracking-widest">
            Statement Intelligence Engine
          </span>
          <h1 className="mt-5 text-4xl font-bold leading-tight sm:text-5xl">
            Extract every UPI credit from any Indian bank statement
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm opacity-80 sm:text-base">
            Upload the original statement. The engine detects the transaction table on its own and returns
            date, UTR and amount — nothing else.
          </p>
        </div>
      </div>

      <div className="mx-auto -mt-16 w-full max-w-3xl space-y-6 px-4 pb-20">
        <UploadPanel onFile={handleFile} busy={busy} fileName={fileName} />

        {error ? (
          <div
            role="alert"
            className="panel flex items-start gap-3 border-destructive/30 px-5 py-4 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <p>{error}</p>
          </div>
        ) : null}

        {rows ? <ResultsTable rows={rows} /> : null}

        <section className="grid gap-4 sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <article key={title} className="panel px-5 py-5">
              <Icon className="size-5 text-accent-foreground" />
              <h3 className="mt-3 text-sm font-semibold">{title}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{body}</p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
