"use client";
import { useState } from "react";
import { E } from "@/components/mgr/e";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Attachment, AttachmentContent, AttachmentDescription, AttachmentTitle, AttachmentTrigger } from "@/components/ui/attachment";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IMPORT_FIELDS, IMPORT_KINDS, IMPORT_ROW_CAP, validateImportRow, type ImportKind, type ImportLookups, type ImportResult } from "@/lib/import-csv";

export type ImportViewModel = {
  kind: ImportKind; step: number; fileName?: string | null; headers?: string[]; csvRowCount?: number;
  mapping: Record<string, number>; rows: Record<string, string>[]; validation: string[][]; lookups: ImportLookups;
  batchId?: string; result?: ImportResult | null; error?: string | null; busy?: boolean; backHref?: string;
};
const KIND_LABELS = ["customers", "ship-tos", "products", "channel prices", "opening balances"];

export function ImportView({ model, onKind, onFile, onStep, onMapping, onEdit, onCommit, onCorrectBlocked }: {
  model: ImportViewModel; onKind?: (kind: ImportKind) => void; onFile?: (file?: File) => void; onStep?: (step: number) => void;
  onMapping?: (field: string, column: number) => void; onEdit?: (row: number, field: string, value: string) => void;
  onCommit?: () => void; onCorrectBlocked?: () => void;
}) {
  const { kind, step, mapping, lookups, result, busy } = model;
  const [draft, setDraft] = useState<Pick<ImportViewModel, "rows" | "validation"> | null>(null);
  const { rows, validation } = onEdit ? model : draft ?? model;
  const edit = (index: number, field: string, value: string) => {
    if (onEdit) return onEdit(index, field, value);
    const next = rows.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row);
    setDraft({ rows: next, validation: next.map(row => validateImportRow(kind, row, lookups)) });
  };
  const fields = IMPORT_FIELDS[kind], ready = validation.filter(errors => !errors.length).length;
  return <>
    {E.back("Settings", "Import", undefined, model.backHref)}
    {E.stp(["upload", "map", "preview", "commit"], step)}
    <fieldset disabled={step !== 0 || busy} className="min-w-0">
      <ToggleGroup type="single" value={kind} onValueChange={value => { if (value) onKind?.(value as ImportKind); }} variant="outline" size="sm" className="flex-wrap justify-start">
        {IMPORT_KINDS.map((value, index) => <ToggleGroupItem key={value} value={value}>{KIND_LABELS[index]}</ToggleGroupItem>)}
      </ToggleGroup>
    </fieldset>
    {model.error && <p role="alert" className="text-destructive">{model.error}</p>}
    {step === 0 && <>
      <p>Upload a CSV with a header row, up to {IMPORT_ROW_CAP} records. Quoted commas and newlines are supported.</p>
      <Field><FieldLabel>CSV file</FieldLabel><Attachment state={model.headers ? "done" : "idle"} className="w-full">
        <AttachmentContent><AttachmentTitle>{model.fileName ?? "Choose a CSV file"}</AttachmentTitle><AttachmentDescription>{model.headers ? `${model.csvRowCount} rows ready to map` : ".csv · up to 5,000 rows"}</AttachmentDescription></AttachmentContent>
        <AttachmentTrigger asChild aria-label="Choose CSV file"><label className="cursor-pointer"><input type="file" accept=".csv,text/csv" className="sr-only" onChange={event => onFile?.(event.target.files?.[0])} /></label></AttachmentTrigger>
      </Attachment></Field>
      {model.headers && <Button onClick={() => onStep?.(1)}>Map {model.csvRowCount} rows</Button>}
    </>}
    {step === 1 && <>
      <p>Map CSV columns to fields. Required fields are marked *. References use IDs from the lists below.</p>
      {fields.map(field => <Field key={field.name}>
        <FieldLabel>{field.name}{field.required ? " *" : ""}</FieldLabel>
        <Select value={onMapping ? String(mapping[field.name] ?? -1) : undefined} defaultValue={onMapping ? undefined : String(mapping[field.name] ?? -1)} onValueChange={value => onMapping?.(field.name, Number(value))}>
          <SelectTrigger className="w-full" aria-label={field.name}><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup><SelectItem value="-1">Not mapped</SelectItem>{model.headers?.map((header, index) => <SelectItem key={header} value={String(index)}>{header}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
        {field.values && <span className="text-sm text-muted-foreground">{field.values.join(", ")}</span>}
      </Field>)}
      <Button onClick={() => onStep?.(2)}>Preview {rows.length} rows</Button><Button variant="outline" onClick={() => onStep?.(0)}>Back to upload</Button>
    </>}
    {(step === 1 || step === 2) && <>
      {kind === "products_skus" && <p>Use an existing packaged formatId; create missing formats in Beer / Formats first. product is the brand name. Existing brands keep their style and ABV; new brands use these fields. Every row creates a SKU.</p>}
      {kind === "opening_balances" && E.note("qty is a positive count of SKU units. Both locationId and its binId are required. Posting appends opening stock; importing the same stock as a new batch would add it again.")}
      {fields.filter(field => field.lookup).map(field => <details key={field.name}><summary>{field.name} reference IDs</summary><ul className="space-y-1 break-all text-sm">{lookups[field.lookup!]?.map(item => <li key={item.id}>{item.name}{item.location_id ? ` · ${lookups.locations.find(location => location.id === item.location_id)?.name}` : ""} · <code>{item.id}</code></li>)}</ul></details>)}
    </>}
    {step === 2 && <>
      <p>{ready} ready · {rows.length - ready} blocked. Edit values here or go back to mapping. Ready rows commit independently; blocked rows are reported individually.</p>
      <div className="[&_td]:whitespace-normal [&_td]:[overflow-wrap:anywhere] [&_th:first-child]:w-10 [&_th:last-child]:w-20 [&_table]:table-fixed [&_table]:min-w-0 [&_table]:w-full">{E.tbl(["row", "record", "match", "state"], rows.map((row, index) => [String(index + 1), row.name ?? row.product ?? row.label ?? `Row ${index + 1}`, validation[index]?.join("; ") || "validated", validation[index]?.length ? "blocked" : "ready"]))}</div>
      {rows.map((row, index) => <details key={index}><summary>Edit row {index + 1} · {row.name ?? row.product ?? row.label ?? kind.replaceAll("_", " ")}</summary>
        <div className="grid gap-3 py-3 sm:grid-cols-2">{fields.map(field => <Field key={field.name}>
          <FieldLabel>{field.name}{field.required ? " *" : ""}</FieldLabel>
          <input aria-label={`Row ${index + 1} ${field.name}`} className="min-w-0 rounded-md border border-input bg-background p-2 text-sm" value={row[field.name] ?? ""} onChange={event => edit(index, field.name, event.target.value)} />
        </Field>)}</div>
      </details>)}
      <Button disabled={!ready || busy} onClick={onCommit}>{kind === "opening_balances" ? "Post opening balances" : `Import ${ready} ready rows`}</Button>
      <Button variant="outline" onClick={() => onStep?.(1)}>Back to mapping</Button>
      {E.note("Retry returns original results. Correct only blocked rows in a new batch.")}
    </>}
    {step === 3 && <>
      <p>{busy ? "Committing rows…" : result ? `${result.committed} committed · ${result.blocked} blocked` : "Batch results need recovery"}</p>
      <p className="break-all text-sm">Batch request: {model.batchId}</p>
      {E.note("Retry keeps the exact batch and returns its first results. Keep this page open until results are recovered. To correct blocked records, start a batch containing only those rows; never resend committed opening balances as a new batch.")}
      {result && E.tbl(["Row", "Result"], result.outcomes.map(row => [String(row.row), `${row.status}${row.error ? `: ${row.error}` : row.result?.id ? ` · ${row.result.id}` : ""}`]))}
      <Button variant="outline" disabled={busy} onClick={onCommit}>Retry same batch</Button>
      {!!result?.blocked && <Button disabled={busy} onClick={onCorrectBlocked}>Correct blocked rows in a new batch</Button>}
    </>}
  </>;
}
