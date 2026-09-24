"use client";
import { useMemo, useState } from "react";
import { ImportView } from "@/components/mgr/views/import";
import { command } from "@/lib/commands/client";
import { useCommandContext } from "@/app/(app)/brewery-provider";
import type { CommandContextExpectation } from "@/lib/commands/registry";
import { IMPORT_FIELDS, mapCsvRows, parseCsv, readyImportRows, validateImportRow, type ImportKind, type ImportLookups, type ImportResult } from "@/lib/import-csv";

export function ImportWizard({ breweryId, lookups }: { breweryId: string; lookups: ImportLookups }) {
  const renderedContext = useCommandContext();
  const [kind, setKind] = useState<ImportKind>("customers");
  const [csv, setCsv] = useState<ReturnType<typeof parseCsv> | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [step, setStep] = useState(0);
  // ponytail: batch state lasts while this page stays open; persist it for reload recovery.
  const [batch, setBatch] = useState<{ requestId: string; kind: ImportKind; rows: Record<string, string>[]; expectedContext: CommandContextExpectation } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fields = IMPORT_FIELDS[kind];
  const rows = useMemo(() => csv ? mapCsvRows(csv.rows, mapping) : [], [csv, mapping]);
  const validation = useMemo(() => rows.map(row => validateImportRow(kind, row, lookups)), [rows, kind, lookups]);

  function stage(next: ReturnType<typeof parseCsv>) {
    setCsv(next); setMapping(Object.fromEntries(fields.map(f => [f.name, next.headers.indexOf(f.name)]))); setError(null);
  }
  async function commit() {
    const action = batch ?? { requestId: crypto.randomUUID(), kind, rows: readyImportRows(rows, validation), expectedContext: renderedContext };
    setBatch(action); setBusy(true); setError(null); setStep(3);
    try { setResult(await command(action.expectedContext.breweryId ?? breweryId, "import_csv", { kind: action.kind, rows: action.rows }, action.requestId, action.expectedContext) as ImportResult); }
    catch (err) { setError(`${err instanceof Error ? err.message : "Import failed"}. Some rows may have committed. Retry this same batch to recover their results.`); }
    finally { setBusy(false); }
  }
  function correctBlocked() {
    if (!batch || !result) return;
    const blocked = result.outcomes.filter(row => row.status === "blocked").map(row => batch.rows[row.row - 1]);
    stage({ headers: fields.map(f => f.name), rows: blocked.map(row => fields.map(f => row[f.name] ?? "")) });
    setBatch(null); setResult(null); setStep(2);
  }
  return <ImportView model={{ kind, step, fileName, headers: csv?.headers, csvRowCount: csv?.rows.length, mapping, rows, validation, lookups, result, error, busy, batchId: batch?.requestId, backHref: "/settings" }}
    onKind={value => { setKind(value); setCsv(null); setFileName(null); }}
    onStep={setStep} onMapping={(field, column) => setMapping({ ...mapping, [field]: column })}
    onFile={async file => {
      setCsv(null); setError(null);
      if (!file) return;
      setFileName(file.name);
      try { stage(parseCsv(await file.text())); } catch (err) { setError(err instanceof Error ? err.message : "Could not read CSV"); }
    }}
    onEdit={(rowIndex, field, value) => {
      // Editing works for unmapped fields too: materialize the current map.
      const headers = fields.map(field => field.name), values = rows.map(row => headers.map(header => row[header] ?? ""));
      values[rowIndex][headers.indexOf(field)] = value;
      stage({ headers, rows: values });
    }}
    onCommit={() => void commit()} onCorrectBlocked={correctBlocked}
  />;
}
