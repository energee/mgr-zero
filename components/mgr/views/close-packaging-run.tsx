"use client";

// components/mgr/views/close-packaging-run.tsx — Close packaging run.
// Shared planned facts and copper review; live supplies only the next action.
import { useState, type ReactNode } from "react";
import { PlanCancelled } from "./plan-actions";
import { E } from "@/components/mgr/e";
import { PackagingMaterialActuals } from "./packaging-materials";
import { Button } from "@/components/ui/button";
import { packagingActualsReady, type PackagingActualDraft } from "@/lib/mgr/packaging-actuals";
import { closeRunReady, type PackagingCloseFieldsModel, type ClosePackagingRunViewModel } from "@/lib/mgr/close-packaging-run-view";

export type { ClosePackagingRunViewModel };

export function ClosePackagingRunView({
  model,
  action,
  planActions,
}: {
  model: ClosePackagingRunViewModel;
  action?: ReactNode;
  planActions?: ReactNode;
}) {
  const header = <>
    {E.back(model.backTo ?? "Work", model.title, undefined, model.backHref)}
    {model.brand !== undefined ? E.fld("Brand", model.brand) : null}
    {model.plannedOn !== undefined ? E.fld("Planned", model.plannedOn) : null}
    {model.plannedOutputs ? <>{E.fld("Source", model.source ?? "no source yet")}{E.ttl("Planned outputs")}{E.tbl(["SKU", "planned", "actual"], model.plannedOutputs)}</> : null}
  </>;
  if (model.cancelled) return <>{header}<PlanCancelled /></>;
  return (
    <>
      {header}
      {planActions}
      {model.showCloseReview !== false && model.closeFields ? <PackagingCloseFields model={model.closeFields} /> : null}
      {action}
    </>
  );
}

export function PackagingCloseFields({ model, disabled, ready, retry, onField, onOutput, onActual, onAdd, onRemove, onSubmit, onRefresh, messages }: {
  model: PackagingCloseFieldsModel; disabled?: boolean; ready?: boolean; retry?: boolean;
  onField?: (field: "bblDrawn" | "lotCode" | "packagedOn" | "bestBy" | "locationId" | "binId", value: string) => void;
  onOutput?: (id: string, value: string) => void; onActual?: (key: string, patch: Partial<PackagingActualDraft>) => void;
  onAdd?: () => void; onRemove?: (key: string) => void; onSubmit?: () => void; onRefresh?: () => void; messages?: ReactNode;
}) {
  const [fixture, setFixture] = useState(model);
  const view = onField ? model : fixture;
  const changeField = onField ?? ((field, value) => setFixture(previous => ({ ...previous, [field]: value, ...(field === "locationId" ? { binId: "" } : {}) })));
  const changeOutput = onOutput ?? ((id, value) => setFixture(previous => ({ ...previous, outputs: previous.outputs.map(row => row.id === id ? { ...row, qty: value } : row) })));
  const changeActual = onActual ?? ((key, patch) => setFixture(previous => ({ ...previous, actuals: previous.actuals.map(row => row.key === key ? { ...row, ...patch } : row) })));
  const addActual = onAdd ?? (() => setFixture(previous => ({ ...previous, actuals: [...previous.actuals, { key: crypto.randomUUID(), materialId: "", locationId: "", binId: "", lotId: null, used: "0", loss: "0", unused: "0" }] })));
  const removeActual = onRemove ?? ((key) => setFixture(previous => ({ ...previous, actuals: previous.actuals.filter(row => row.key !== key) })));
  const maySubmit = ready ?? (closeRunReady({ ...view, actuals: Object.fromEntries(view.outputs.map(row => [row.id, row.qty])) }) && packagingActualsReady(view.actuals, view.plan.materials, view.plan.planned.map(row => row.materialId)));
  return <div className="flex flex-col gap-3">
    {E.edit("Barrels drawn", view.bblDrawn, "number", undefined, { min: 0, step: "any", disabled, required: true, onChange: value => changeField("bblDrawn", value) })}
    {E.ttl("Actual outputs")}
    {view.outputs.map(row => <div key={row.id}>{E.edit(`${row.name} actual`, row.qty, "number", undefined, { min: 0, step: "any", disabled, required: true, onChange: value => changeOutput(row.id, value) })}</div>)}
    {E.edit("Lot code", view.lotCode, "text", undefined, { disabled, required: true, onChange: value => changeField("lotCode", value) })}
    {E.edit("Packaged on", view.packagedOn, "date", undefined, { disabled, required: true, onChange: value => changeField("packagedOn", value) })}
    {E.edit("Best by · optional", view.bestBy, "date", undefined, { disabled, onChange: value => changeField("bestBy", value) })}
    {E.pick("Finished goods location", view.locationId, view.locations.map(row => ({ value: row.id, label: row.name })), { disabled, onChange: value => changeField("locationId", value) })}
    {E.pick("Finished goods bin", view.binId, view.bins.filter(row => row.location_id === view.locationId).map(row => ({ value: row.id, label: row.name })), { disabled, onChange: value => changeField("binId", value) })}
    <PackagingMaterialActuals plan={view.plan} rows={view.actuals} locations={view.locations} bins={view.bins} disabled={disabled} onChange={changeActual} onAdd={addActual} onRemove={removeActual} />
    <Button type="button" variant="outline" disabled={disabled} onClick={onRefresh}>Review current material plan</Button>
    {messages}
    <Button type="button" data-variant="irreversible" disabled={!maySubmit || (disabled && !retry)} onClick={onSubmit}>{retry ? "Retry unchanged close" : "Close packaging run"}</Button>
  </div>;
}
