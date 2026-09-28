"use client";

import { useState } from "react";
import { emptyPackagingActual, packagingCorrectionReady, patchActual, removeActual } from "@/lib/mgr/packaging-actuals";
import { materialSourceKey } from "@/lib/mgr/material-source";
import { toTicks } from "@/lib/mgr/quantity-input";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import type { PackagingActualDraft, PackagingClosePlan, PackagingMaterialRecord, PackagingRequirement } from "@/lib/mgr/packaging-actuals";

const qty = (value: number | undefined) => value === undefined ? "—" : value.toLocaleString("en-US", { maximumFractionDigits: 4 });
export function PackagingRequirements({ planned }: { planned: PackagingRequirement[] }) {
  return <>{E.ttl("Planned materials")}{planned.length ? E.tbl(["Material", "Planned", "On hand", "On order", "Short"], planned.map(row => [row.name, `${qty(row.qty)} ${row.unit}`, qty(row.onHand), qty(row.onOrder), qty(row.short === undefined ? undefined : Math.max(0, row.short))])) : E.info("No materials on this plan’s BOM.")}</>;
}

export function PackagingMaterialActuals({ plan, rows, locations, bins, disabled, restoring, onChange, onAdd, onRemove }: {
  plan: PackagingClosePlan; rows: PackagingActualDraft[]; locations: { id: string; name: string }[];
  bins: { id: string; location_id: string; name: string }[]; disabled?: boolean; restoring?: boolean;
  onChange?: (key: string, patch: Partial<PackagingActualDraft>) => void; onAdd?: () => void; onRemove?: (key: string) => void;
}) {
  return <>
    <PackagingRequirements planned={plan.planned} />
    {E.ttl("Confirmed material actuals")}
    {E.info("Used plus damaged/lost comes off the selected stock. Unused returned is an observation; it does not add stock. Confirm zero for any planned material not used.")}
    {rows.map((row, index) => {
      const material = plan.materials.find(item => item.id === row.materialId);
      const source = plan.sources.find(item => materialSourceKey(item) === materialSourceKey(row));
      const patch = (value: Partial<PackagingActualDraft>) => onChange?.(row.key, value);
      return <div key={row.key} className="flex flex-col gap-2 rounded-lg border p-3">
        {E.pick(`Material ${index + 1}`, row.materialId, plan.materials.map(item => ({ value: item.id, label: item.name })), { disabled, onChange: value => patch({ materialId: value, lotId: null }) })}
        {E.pick(`Source location ${index + 1}`, row.locationId, locations.map(item => ({ value: item.id, label: item.name })), { disabled, onChange: value => patch({ locationId: value, binId: "" }) })}
        {E.pick(`Source bin ${index + 1}`, row.binId, bins.filter(item => item.location_id === row.locationId).map(item => ({ value: item.id, label: item.name })), { disabled, onChange: value => patch({ binId: value }) })}
        {material?.lotTracked ? E.pick(`Source lot ${index + 1}`, row.lotId ?? "", [{ value: "", label: "No lot · only all-zero actuals" }, ...plan.lots.filter(item => item.materialId === row.materialId).map(item => ({ value: item.id, label: item.code }))], { disabled, onChange: value => patch({ lotId: value || null }) }) : E.fld("Source lot", "Untracked stock")}
        {E.fld(restoring ? "Available after reversal" : "Available at source", `${qty(source?.qty ?? 0)} ${material?.unit ?? ""}`)}
        {([['used', 'Used'], ['loss', 'Damaged / lost'], ['unused', 'Unused returned']] as const).map(([field, label]) => <div key={field}>{E.edit(`${label} ${index + 1} (${material?.unit ?? "base units"})`, row[field], "number", undefined, { min: 0, step: material?.unit === "each" ? 1 : 0.0001, disabled, required: true, onChange: value => patch({ [field]: value }) })}</div>)}
        {toTicks(Number(row.used)) + toTicks(Number(row.loss)) > toTicks(source?.qty ?? 0) ? E.note(restoring ? "Replacement use plus loss exceeds stock after reversal. Choose or split the source." : "Used plus loss exceeds this source’s current stock. Choose or split the source before closing.") : null}
        <Button type="button" variant="ghost" disabled={disabled} onClick={() => onRemove?.(row.key)}>Remove source {index + 1}</Button>
      </div>;
    })}
    <Button type="button" variant="outline" disabled={disabled} onClick={onAdd}>Add material source</Button>
  </>;
}

export function PackagingMaterialHistory({ records }: { records: PackagingMaterialRecord[] }) {
  return <>{E.ttl("Material record history")}{records.length ? records.map(record => <section key={record.id} className="flex flex-col gap-2">
    {E.fld(record.corrects_id ? "Correction" : "Original close", record.correction_reason ?? record.created_at)}
    {E.tbl(["Planned material", "Quantity"], record.planned.map(row => [row.name, `${qty(row.qty)} ${row.unit}`]))}
    {E.tbl(["Material / source", "Used", "Lost", "Unused"], record.actuals.map(row => [`${row.material_name} · ${row.location_name} / ${row.bin_name} · ${row.lot_code ?? "untracked"} (${row.unit})`, qty(row.qty_used), qty(row.qty_loss), qty(row.qty_unused)]))}
  </section>) : E.info("This run closed before confirmed material records were available.")}</>;
}

export function PackagingMaterialCorrection({ plan, rows, locations, bins, reason, disabled, ready, retry, onReason, onChange, onAdd, onRemove, onSubmit, messages }: {
  plan: PackagingClosePlan; rows: PackagingActualDraft[]; locations: { id: string; name: string }[]; bins: { id: string; location_id: string; name: string }[];
  reason: string; disabled?: boolean; ready?: boolean; retry?: boolean; onReason?: (value: string) => void;
  onChange?: (key: string, patch: Partial<PackagingActualDraft>) => void; onAdd?: () => void; onRemove?: (key: string) => void; onSubmit?: () => void; messages?: React.ReactNode;
}) {
  const [fixture, setFixture] = useState({ rows, reason });
  const view = onReason ? { rows, reason } : fixture;
  const changeReason = onReason ?? ((value) => setFixture(previous => ({ ...previous, reason: value })));
  const changeActual = onChange ?? ((key, patch) => setFixture(previous => ({ ...previous, rows: patchActual(previous.rows, key, patch) })));
  const addActual = onAdd ?? (() => setFixture(previous => ({ ...previous, rows: [...previous.rows, emptyPackagingActual()] })));
  const dropActual = onRemove ?? ((key) => setFixture(previous => ({ ...previous, rows: removeActual(previous.rows, key) })));
  const maySubmit = ready ?? packagingCorrectionReady(view.reason, view.rows, plan);
  return <section className="flex flex-col gap-3">
    {E.ttl("Correct material actuals")}
    {E.info("Corrections preserve the original record, reverse its material movements and record replacements. Finished outputs and tank draw stay unchanged. Downstream stock use, a completed batch or a filed report prevents correction.")}
    {E.edit("Correction reason", view.reason, "text", undefined, { required: true, disabled, onChange: changeReason })}
    <PackagingMaterialActuals plan={plan} rows={view.rows} locations={locations} bins={bins} disabled={disabled} restoring onChange={changeActual} onAdd={addActual} onRemove={dropActual} />
    {messages}
    <Button type="button" disabled={!maySubmit || (disabled && !retry)} onClick={onSubmit}>{retry ? "Retry unchanged correction" : "Correct material actuals"}</Button>
  </section>;
}
