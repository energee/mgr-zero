"use client";
import { z } from "zod";
import { useMemo, useState, useSyncExternalStore } from "react";
import { ImportView } from "@/components/mgr/views/import";
import { beginRecovery, finishRecovery, readRecoveries } from "@/lib/commands/recovery";
import { command } from "@/lib/commands/client";
import { useCommandContext } from "@/app/(app)/brewery-provider";
import type { CommandContextExpectation } from "@/lib/commands/registry";
import { IMPORT_KINDS, IMPORT_FIELDS, mapCsvRows, parseCsv, readyImportRowNumbers, readyImportRows, validateImportRow, type ImportKind, type ImportLookups, type ImportResult } from "@/lib/import-csv";

export function ImportWizard({ breweryId, lookups }: { breweryId: string; lookups: ImportLookups }) {
  const renderedContext = useCommandContext();
  const hydrated = useSyncExternalStore(() => () => {}, () => true, () => false);
  return hydrated ? <ImportSession key={JSON.stringify(renderedContext)} breweryId={breweryId} lookups={lookups} /> : null;
}

function ImportSession({ breweryId, lookups }: { breweryId: string; lookups: ImportLookups }) {
  const renderedContext = useCommandContext();
  const [recovery] = useState(() => {
    try {
      const saved = readRecoveries(sessionStorage, renderedContext).find(row => row.name === "import_csv");
      if (saved) saved.input = z.object({ kind: z.enum(IMPORT_KINDS), rows: z.array(z.record(z.string(), z.string())) }).parse(saved.input);
      return { saved, error: null };
    }
    catch (cause) { return { saved: undefined, error: cause instanceof Error ? cause.message : "Saved import could not be read." }; }
  });
  const savedInput = recovery.saved?.input as { kind: ImportKind; rows: Record<string, string>[] } | undefined;
  const [kind, setKind] = useState<ImportKind>(savedInput?.kind ?? "customers");
  const [csv, setCsv] = useState<ReturnType<typeof parseCsv> | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [step, setStep] = useState(recovery.saved ? 3 : 0);
  const [batch, setBatch] = useState<{ requestId: string; kind: ImportKind; rows: Record<string, string>[]; previewRows: number[]; expectedContext: CommandContextExpectation } | null>(recovery.saved && savedInput ? { requestId: recovery.saved.requestId, ...savedInput, previewRows: recovery.saved.previewRows ?? savedInput.rows.map((_, index) => index + 1), expectedContext: recovery.saved.expectedContext } : null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(recovery.error);
  const [busy, setBusy] = useState(false);
  const fields = IMPORT_FIELDS[kind];
  const rows = useMemo(() => csv ? mapCsvRows(csv.rows, mapping) : [], [csv, mapping]);
  const validation = useMemo(() => rows.map(row => validateImportRow(kind, row, lookups)), [rows, kind, lookups]);

  function stage(next: ReturnType<typeof parseCsv>) {
    setCsv(next); setMapping(Object.fromEntries(fields.map(f => [f.name, next.headers.indexOf(f.name)]))); setError(null);
  }
  async function commit() {
    const action = batch ?? { requestId: crypto.randomUUID(), kind, rows: readyImportRows(rows, validation), previewRows: readyImportRowNumbers(validation), expectedContext: renderedContext };
    setBatch(action); setBusy(true); setError(null); setStep(3);
    try {
      const saved = beginRecovery(sessionStorage, action.expectedContext, location.pathname, "import_csv", { kind: action.kind, rows: action.rows }, { requestId: action.requestId, previewRows: action.previewRows });
      const recovered = await command(action.expectedContext.breweryId ?? breweryId, "import_csv", saved.input, saved.requestId, action.expectedContext) as ImportResult;
      setResult(recovered);
      finishRecovery(sessionStorage, saved);
    }
    catch (err) { setError(`${err instanceof Error ? err.message : "Import failed"}. Some rows may have committed. Retry this same batch to recover their results.`); }
    finally { setBusy(false); }
  }
  // The user checked the result: drop the saved batch (nothing is sent) and
  // return to the preview, or to upload after a reload lost the staged CSV.
  function discard() {
    if (!batch) return;
    try {
      const saved = readRecoveries(sessionStorage, batch.expectedContext).find(row => row.requestId === batch.requestId);
      if (saved) finishRecovery(sessionStorage, saved); // Absent means it already finished; there is nothing left to remove.
    } catch (cause) { return setError(cause instanceof Error ? cause.message : "The saved batch could not be discarded."); }
    setBatch(null); setResult(null); setError(null); setStep(csv ? 2 : 0);
  }
  function correctBlocked() {
    if (!batch || !result) return;
    const blocked = result.outcomes.filter(row => row.status === "blocked").map(row => batch.rows[row.row - 1]);
    stage({ headers: fields.map(f => f.name), rows: blocked.map(row => fields.map(f => row[f.name] ?? "")) });
    setBatch(null); setResult(null); setStep(2);
  }
  return <ImportView model={{ kind, step, fileName, headers: csv?.headers, csvRowCount: csv?.rows.length, mapping, rows, validation, lookups, result, error, busy, batchId: batch?.requestId, previewRows: batch?.previewRows, backHref: "/settings" }}
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
    onCommit={() => void commit()} onCorrectBlocked={correctBlocked} onDiscard={discard}
  />;
}
