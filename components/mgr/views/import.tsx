"use client";
import { useState } from "react";
import { E } from "@/components/mgr/e";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Attachment, AttachmentContent, AttachmentDescription, AttachmentTitle, AttachmentTrigger } from "@/components/ui/attachment";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { IMPORT_FIELDS, IMPORT_FIELD_LABELS, IMPORT_KINDS, IMPORT_ROW_CAP_LABEL, canReviewImport, importTemplateCsv, importTemplateName, readyImportRows, validateImportRow, type ImportKind, type ImportLookups, type ImportResult } from "@/lib/import-csv";
import { downloadCsv } from "@/lib/download-csv";
import { importKindLabel } from "@/lib/mgr/labels";
import { ConfirmDiscard } from "@/components/mgr/views/command-recovery";

export type ImportViewModel = {
  kind: ImportKind; step: number; fileName?: string | null; headers?: string[]; csvRowCount?: number;
  mapping: Record<string, number>; rows: Record<string, string>[]; validation: string[][]; lookups: ImportLookups;
  batchId?: string; result?: ImportResult | null; error?: string | null; busy?: boolean; backHref?: string;
  /** Preview row number of each sent row; outcome row n renders as previewRows[n - 1]. */
  previewRows?: number[];
};

/** How the upload step's column list marks a field; state is required only for a US row. */
function columnRequirementLabel(field: { required?: boolean; usOnly?: boolean }): string {
  if (field.required) return "required";
  if (field.usOnly) return "required for a US address";
  return "optional";
}

/**
 * onDiscard drops an unresolved batch's saved request (after a confirming step) so a new batch can start.
 * onNextFile returns to upload once results are recovered; it is never offered while a batch is unresolved.
 */
export function ImportView({ model, onKind, onFile, onStep, onMapping, onEdit, onCommit, onCorrectBlocked, onDiscard, onNextFile }: {
  model: ImportViewModel; onKind?: (kind: ImportKind) => void; onFile?: (file?: File) => void; onStep?: (step: number) => void;
  onMapping?: (field: string, column: number) => void; onEdit?: (row: number, field: string, value: string) => void;
  onCommit?: () => void; onCorrectBlocked?: () => void; onDiscard?: () => void; onNextFile?: () => void;
}) {
  const { kind, step, mapping, lookups, result, busy } = model;
  const [draft, setDraft] = useState<Pick<ImportViewModel, "rows" | "validation"> | null>(null);
  const { rows, validation } = onEdit ? model : draft ?? model;
  const edit = (index: number, field: string, value: string) => {
    if (onEdit) return onEdit(index, field, value);
    const next = rows.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row);
    setDraft({ rows: next, validation: next.map(row => validateImportRow(kind, row, lookups)) });
  };
  const fields = IMPORT_FIELDS[kind], ready = readyImportRows(rows, validation).length;
  const canReview = canReviewImport(kind, mapping, model.headers ?? [], rows);
  return <>
    {E.back("Settings", "Import", undefined, model.backHref)}
    {E.stp(["Upload", "Match columns", "Review", "Import"], step)}
    <FieldSet disabled={step !== 0 || busy} className="min-w-0 gap-0">
      <FieldLegend variant="label">What are you importing?</FieldLegend>
      <ToggleGroup type="single" value={kind} onValueChange={value => { if (value) onKind?.(value as ImportKind); }} variant="outline" size="sm" className="flex-wrap justify-start">
        {IMPORT_KINDS.map(value => <ToggleGroupItem key={value} value={value}>{importKindLabel(value)}</ToggleGroupItem>)}
      </ToggleGroup>
    </FieldSet>
    {model.error && <p role="alert" className="text-destructive">{model.error}</p>}
    {step === 0 && <>
      <p>Save your spreadsheet as a CSV file with one record per row, up to {IMPORT_ROW_CAP_LABEL} rows. Name the first row’s columns exactly as listed below, with the same capitals, and MGR matches them for you. You can match columns with other names in the next step.</p>
      {E.ttl(`${importKindLabel(kind)} columns`)}
      <ul className="space-y-1 text-sm">{fields.map(field => <li key={field.name}>{IMPORT_FIELD_LABELS[field.name]} · <code>{field.name}</code> · {columnRequirementLabel(field)}{field.lookup && " · name or ID"}</li>)}</ul>
      {E.btn("Download template", "g", undefined, () => downloadCsv(importTemplateName(kind), importTemplateCsv(kind)))}
      <p className="text-sm text-muted-foreground">The template includes one incomplete example row, with a required cell left blank so it cannot be imported as downloaded. Delete the example and add your own records. Reference cells need your existing record names or IDs.</p>
      <Field><FieldLabel>CSV file</FieldLabel><Attachment state={model.headers ? "done" : "idle"} className="w-full">
        <AttachmentContent><AttachmentTitle>{model.fileName ?? "Choose a CSV file"}</AttachmentTitle><AttachmentDescription>{model.headers ? `${model.csvRowCount} ${model.csvRowCount === 1 ? "row" : "rows"} ready` : `.csv · up to ${IMPORT_ROW_CAP_LABEL} rows`}</AttachmentDescription></AttachmentContent>
        <AttachmentTrigger asChild aria-label="Choose CSV file"><label className="cursor-pointer"><input type="file" accept=".csv,text/csv" className="sr-only" onChange={event => onFile?.(event.target.files?.[0])} /></label></AttachmentTrigger>
      </Attachment></Field>
      {model.headers && <Button onClick={() => onStep?.(1)}>Match columns</Button>}
    </>}
    {step === 1 && <>
      <p>For each field, choose the column in your file that fills it. Fields marked * are required. A reference field takes a record’s exact name or its ID, as listed below. Capitals and extra spaces in a name do not matter. If two records share a name, use the ID.</p>
      {fields.map(field => <Field key={field.name}>

        {E.pick(IMPORT_FIELD_LABELS[field.name] + (field.required ? " *" : ""), String(mapping[field.name] ?? -1), [{ value: "-1", label: "No column" }, ...(model.headers?.map((header, index) => ({ value: String(index), label: header })) ?? [])], { onChange: onMapping ? value => onMapping?.(field.name, Number(value)) : undefined })}
        {field.values && <span className="text-sm text-muted-foreground">{field.values.join(", ")}</span>}
      </Field>)}
      {!canReview && <p className="text-sm text-muted-foreground">Match every required field before continuing. State also needs a column when any row has a US address.</p>}
      <Button disabled={!canReview || busy} onClick={() => { if (canReview) onStep?.(2); }}>Review {rows.length} {rows.length === 1 ? "row" : "rows"}</Button><Button variant="outline" onClick={() => onStep?.(0)}>Back to upload</Button>
    </>}
    {(step === 1 || step === 2) && <>
      {kind === "products_skus" && <p>For Format, use the name or ID of an existing packaged format. Create any missing format in Beer / Formats first. The Brand column is the brand name. An existing brand keeps its style and ABV; a new brand takes them from the row. Every row creates a SKU.</p>}
      {kind === "opening_balances" && E.info("Quantity is the number of SKU units and must be more than zero. Location and Bin are both required, and each takes a name or an ID. A bin name must belong to the row’s location. Posting adds the stock, so importing the same stock again in a new batch counts it twice.")}
      {fields.filter(field => field.lookup).map(field => <details key={field.name}><summary>{IMPORT_FIELD_LABELS[field.name]} reference names and IDs</summary><ul className="space-y-1 break-all text-sm">{lookups[field.lookup!]?.filter(item => field.lookup !== "formats" || kind !== "products_skus" || item.basis === "packaged").map(item => <li key={item.id}>{item.name}{item.location_id ? ` · ${lookups.locations.find(location => location.id === item.location_id)?.name}` : ""} · <code>{item.id}</code></li>)}</ul></details>)}
    </>}
    {step === 2 && <>
      <p>{ready} ready · {rows.length - ready} blocked. Fix values here, or go back to matching columns. Only ready rows are imported, each one on its own. Fix blocked rows first, or they are left out.</p>
      {E.tbl(["row", "record", "match", "state"], rows.map((row, index) => [String(index + 1), row.name ?? row.product ?? row.label ?? `Row ${index + 1}`, validation[index]?.join("; ") || "validated", validation[index]?.length ? "blocked" : "ready"]), ["r", "l", "l", "l"])}
      {rows.map((row, index) => <details key={index}><summary>Edit row {index + 1} · {row.name ?? row.product ?? row.label ?? importKindLabel(kind)}</summary>
        <div className="grid gap-3 py-3 sm:grid-cols-2">{fields.map(field => <Field key={field.name}>
          {E.edit(`${IMPORT_FIELD_LABELS[field.name]}${field.required ? " *" : ""}`, row[field.name] ?? "", "text", undefined, { onChange: value => edit(index, field.name, value), "aria-label": `Row ${index + 1} ${IMPORT_FIELD_LABELS[field.name]}` })}
        </Field>)}</div>
      </details>)}
      <Button disabled={!ready || busy} onClick={onCommit}>{kind === "opening_balances" ? "Post opening balances" : `Import ${ready} ${ready === 1 ? "row" : "rows"}`}</Button>
      <Button variant="outline" onClick={() => onStep?.(1)}>Back to matching columns</Button>
      {E.info("If the connection drops during the import, you can retry it without importing any row twice. To fix blocked rows later, import only those rows in a new batch.")}
    </>}
    {step === 3 && <>
      <p>{busy ? "Importing rows…" : result ? `${result.committed} committed · ${result.blocked} blocked` : "Results have not come back yet"}</p>
      <p className="break-all text-sm">Batch request: {model.batchId}</p>
      {E.info("Retry same batch sends the same rows again and shows their first results, so no row is imported twice. Keep this tab open until the results show. If you reload the tab, this batch comes back. To fix blocked rows, import only those rows in a new batch.")}
      {kind === "opening_balances" && E.info("Never import opening balances that already went in again, or the stock is counted twice.")}
      {result && E.tbl(["Row", "Result"], result.outcomes.map(row => [String(model.previewRows?.[row.row - 1] ?? row.row), `${row.status}${row.error ? `: ${row.error}` : row.result?.id ? ` · ${row.result.id}` : ""}`]), ["r", "l"])}
      <Button variant="outline" disabled={busy} onClick={onCommit}>Retry same batch</Button>
      {!!result?.blocked && <Button disabled={busy} onClick={onCorrectBlocked}>Correct blocked rows in a new batch</Button>}
      {result && !busy && <Button variant="outline" onClick={onNextFile}>Import another file</Button>}
      {!result && !busy && onDiscard && <ConfirmDiscard onDiscard={onDiscard}
        note="MGR will stop offering this retry and will not send the batch. Check the result first: open the imported records and confirm which rows were saved." />}
    </>}
  </>;
}
