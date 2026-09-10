"use client";

import { useMemo, useState } from "react";
import {
  Attachment, AttachmentContent, AttachmentDescription, AttachmentTitle, AttachmentTrigger,
} from "@/components/ui/attachment";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Timeline, TimelineItem } from "@/components/ui/timeline";
import { command } from "@/lib/commands/client";
import { useCommandContext } from "@/app/(app)/brewery-provider";
import type { CommandContextExpectation } from "@/lib/commands/registry";
import { IMPORT_FIELDS, IMPORT_KINDS, IMPORT_ROW_CAP, mapCsvRows, parseCsv, validateImportRow, type ImportKind, type ImportLookups, type ImportResult } from "@/lib/import-csv";

const IMPORT_STEPS = ["upload", "map", "preview", "commit"];

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
  const ready = validation.filter(errors => !errors.length).length;
  const control = "rounded-md border border-input bg-background p-2 text-sm";

  function stage(next: ReturnType<typeof parseCsv>) {
    setCsv(next); setMapping(Object.fromEntries(fields.map(f => [f.name, next.headers.indexOf(f.name)]))); setError(null);
  }
  async function commit() {
    const action = batch ?? { requestId: crypto.randomUUID(), kind, rows, expectedContext: renderedContext };
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
  return <div className="flex items-start">
    <Timeline className="shrink-0 px-2 pt-4 sm:px-4">
      {IMPORT_STEPS.map((title, index) => (
        <TimelineItem
          key={title}
          marker={`Step ${index + 1}`}
          title={title}
          status={index < step ? "completed" : index === step ? "in-progress" : "pending"}
          showConnector={index < IMPORT_STEPS.length - 1}
        />
      ))}
    </Timeline>
    <div className="min-w-0 flex-1 flex flex-col gap-4 p-4">
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {step === 0 && <>
        <Field>
          <FieldLabel>Import kind</FieldLabel>
          <Select value={kind} onValueChange={value => { setKind(value as ImportKind); setCsv(null); setFileName(null); }}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>
              {IMPORT_KINDS.map(k => <SelectItem key={k} value={k}>{k.replaceAll("_", " ")}</SelectItem>)}
            </SelectGroup></SelectContent>
          </Select>
        </Field>
        <p>Upload a CSV with a header row, up to {IMPORT_ROW_CAP} records. Quoted commas and newlines are supported.</p>
        <Field>
          <FieldLabel>CSV file</FieldLabel>
          <Attachment state={csv ? "done" : "idle"} className="w-full">
            <AttachmentContent>
              <AttachmentTitle>{fileName ?? "Choose a CSV file"}</AttachmentTitle>
              <AttachmentDescription>{csv ? `${csv.rows.length} rows ready to map` : ".csv · up to 5,000 rows"}</AttachmentDescription>
            </AttachmentContent>
            <AttachmentTrigger asChild aria-label="Choose CSV file">
              <label className="cursor-pointer"><input type="file" accept=".csv,text/csv" className="sr-only" onChange={async e => {
                const file = e.target.files?.[0]; setCsv(null); setError(null);
                if (!file) return;
                setFileName(file.name);
                try { stage(parseCsv(await file.text())); } catch (err) { setError(err instanceof Error ? err.message : "Could not read CSV"); }
              }} /></label>
            </AttachmentTrigger>
          </Attachment>
        </Field>
        {csv && <Button onClick={() => setStep(1)}>Map {csv.rows.length} rows</Button>}
      </>}
      {step === 1 && <>
        <p>Map CSV columns to fields. Required fields are marked *. References use IDs from the lists below.</p>
        {fields.map(f => <Field key={f.name}>
          <FieldLabel>{f.name}{f.required ? " *" : ""}</FieldLabel>
          <Select value={String(mapping[f.name] ?? -1)} onValueChange={value => setMapping({ ...mapping, [f.name]: Number(value) })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>
              <SelectItem value="-1">Not mapped</SelectItem>
              {csv?.headers.map((h, i) => <SelectItem key={h} value={String(i)}>{h}</SelectItem>)}
            </SelectGroup></SelectContent>
          </Select>
          {f.values && <span className="text-sm text-muted-foreground">{f.values.join(", ")}</span>}
        </Field>)}
        <Button onClick={() => setStep(2)}>Preview {rows.length} rows</Button>
        <Button variant="outline" onClick={() => setStep(0)}>Back to upload</Button>
      </>}
      {(step === 1 || step === 2) && <>
        {kind === "products_skus" && <p>Use an existing packaged formatId; create missing formats in Beer → Formats first. product is the brand name. Existing brands keep their style and ABV; new brands use these fields. Every row creates a SKU.</p>}
        {kind === "opening_balances" && <p>qty is a positive count of SKU units. Both locationId and its binId are required. Posting appends opening stock; importing the same stock as a new batch would add it again.</p>}
        {fields.filter(f => f.lookup).map(f => <details key={f.name}><summary>{f.name} reference IDs</summary><ul className="space-y-1 text-sm">{lookups[f.lookup!]?.map(item => <li key={item.id}>{item.name}{item.location_id ? ` · ${lookups.locations.find(l => l.id === item.location_id)?.name}` : ""} — <code>{item.id}</code></li>)}</ul></details>)}
      </>}
      {step === 2 && <>
        <p>{ready} ready · {rows.length - ready} blocked. Edit values here or go back to mapping. Ready rows commit independently; blocked rows are reported individually.</p>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="p-2 text-left">Row</th>{fields.map(f => <th className="p-2 text-left" key={f.name}>{f.name}</th>)}<th className="p-2 text-left">State</th></tr></thead><tbody>
          {rows.map((row, n) => <tr key={n}><td className="p-2">{n + 1}</td>{fields.map(f => <td key={f.name} className="p-1"><input aria-label={`Row ${n + 1} ${f.name}`} className={`${control} min-w-32`} value={row[f.name] ?? ""} onChange={e => {
            // Editing works for unmapped fields too: materialize the current map.
            const headers = fields.map(f => f.name); const values = rows.map(row => headers.map(h => row[h] ?? ""));
            values[n][headers.indexOf(f.name)] = e.target.value;
            stage({ headers, rows: values });
          }} /></td>)}<td className="p-2">{validation[n].join("; ") || "ready"}</td></tr>)}
        </tbody></table></div>
        <Button disabled={!ready || busy} onClick={() => void commit()}>{kind === "opening_balances" ? "Post opening balances" : `Import ${ready} ready rows`}</Button>
        <Button variant="outline" onClick={() => setStep(1)}>Back to mapping</Button>
      </>}
      {step === 3 && <>
        <p>{busy ? "Committing rows…" : result ? `${result.committed} committed · ${result.blocked} blocked` : "Batch results need recovery"}</p>
        <p className="break-all text-sm">Batch request: {batch?.requestId}</p>
        <p>Retry keeps the exact batch and returns its first results. Keep this page open until results are recovered. To correct blocked records, start a batch containing only those rows; never resend committed opening balances as a new batch.</p>
        {result && <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="p-2 text-left">Row</th><th className="p-2 text-left">Result</th></tr></thead><tbody>{result.outcomes.map(row => <tr key={row.row}><td className="p-2">{row.row}</td><td className="p-2">{row.status}{row.error ? `: ${row.error}` : row.result?.id ? ` · ${row.result.id}` : ""}</td></tr>)}</tbody></table></div>}
        <Button variant="outline" disabled={busy} onClick={() => void commit()}>Retry same batch</Button>
        {!!result?.blocked && <Button disabled={busy} onClick={correctBlocked}>Correct blocked rows in a new batch</Button>}
      </>}
    </div>
  </div>;
}
