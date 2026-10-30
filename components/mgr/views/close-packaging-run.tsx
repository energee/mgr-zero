"use client";

// components/mgr/views/close-packaging-run.tsx — Close packaging run.
// Shared planned facts and copper review; live supplies only the next action.
import { useState, type ReactNode } from "react";
import { PlanCancelled } from "./plan-actions";
import { E } from "@/components/mgr/e";
import { formatDate } from "@/lib/date-format";
import { PackagingMaterialActuals } from "./packaging-materials";
import { IrreversibleSubmit } from "@/components/mgr/irreversible-submit";
import { emptyPackagingActual, patchActual, removeActual, type PackagingActualDraft } from "@/lib/mgr/packaging-actuals";
import { onlyBinIn, packagingCloseReason, type PackagingCloseFieldsModel, type ClosePackagingRunViewModel } from "@/lib/mgr/close-packaging-run-view";

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
    {E.back(model.backTo ?? "Packaging", model.title, undefined, model.backHref, "Packaging runs")}
    {model.brand !== undefined ? E.fld("Brand", model.brand) : null}
    {model.plannedOn !== undefined ? E.fld(model.cancelled ? "Cancelled" : "Planned", formatDate(model.plannedOn)) : null}
    {model.plannedOutputs ? <>{E.fld("Source", model.source ?? "No source yet")}{E.ttl("Planned outputs")}{E.tbl(["SKU", "Planned units", "Actual units"], model.plannedOutputs, ["l", "r", "r"])}</> : null}
  </>;
  return (
    <>
      {header}
      {model.cancelled ? <PlanCancelled /> : <>
        {planActions}
        {model.showCloseReview !== false && model.closeFields ? <PackagingCloseFields model={model.closeFields} /> : null}
        {action}
      </>}
    </>
  );
}

/** Close packaging run's fields and verb. The verb says why it is withheld (packagingCloseReason); a retry of the
 *  unchanged close needs no reason, since its saved request is resent as it was. Choosing a location fills its only bin.
 *  The live form re-reads the material plan when the verb is pressed, so there is no separate review button (#1508). */
export function PackagingCloseFields({ model, disabled, retry, onField, onOutput, onActual, onAdd, onRemove, onSubmit, messages }: {
  model: PackagingCloseFieldsModel; disabled?: boolean; retry?: boolean;
  onField?: (field: "bblDrawn" | "lotCode" | "packagedOn" | "bestBy" | "locationId" | "binId", value: string) => void;
  onOutput?: (id: string, value: string) => void; onActual?: (key: string, patch: Partial<PackagingActualDraft>) => void;
  onAdd?: () => void; onRemove?: (key: string) => void; onSubmit?: () => void; messages?: ReactNode;
}) {
  const [fixture, setFixture] = useState(model);
  const view = onField ? model : fixture;
  const changeField = onField ?? ((field, value) => setFixture(previous => ({ ...previous, [field]: value, ...(field === "locationId" ? { binId: onlyBinIn(previous.bins, value) } : {}) })));
  const changeOutput = onOutput ?? ((id, value) => setFixture(previous => ({ ...previous, outputs: previous.outputs.map(row => row.id === id ? { ...row, qty: value } : row) })));
  const changeActual = onActual ?? ((key, patch) => setFixture(previous => ({ ...previous, actuals: patchActual(previous.actuals, key, patch) })));
  const addActual = onAdd ?? (() => setFixture(previous => ({ ...previous, actuals: [...previous.actuals, emptyPackagingActual()] })));
  const dropActual = onRemove ?? ((key) => setFixture(previous => ({ ...previous, actuals: removeActual(previous.actuals, key) })));
  const reason = retry ? null : packagingCloseReason(view);
  return <div className="flex flex-col gap-3">
    {E.edit("Barrels drawn", view.bblDrawn, "number", undefined, { min: 0, step: "any", disabled, required: true, onChange: value => changeField("bblDrawn", value) })}
    {E.ttl("Actual outputs")}
    {view.outputs.map(row => <div key={row.id}>{E.edit(`${row.name} actual`, row.qty, "number", undefined, { min: 0, step: "any", disabled, required: true, onChange: value => changeOutput(row.id, value) })}</div>)}
    {E.edit("Lot code", view.lotCode, "text", undefined, { disabled, required: true, onChange: value => changeField("lotCode", value) })}
    {E.edit("Packaged on", view.packagedOn, "date", undefined, { disabled, required: true, onChange: value => changeField("packagedOn", value) })}
    {E.edit("Best by · optional", view.bestBy, "date", undefined, { disabled, onChange: value => changeField("bestBy", value) })}
    {E.pick("Finished goods location", view.locationId, view.locations.map(row => ({ value: row.id, label: row.name })), { disabled, required: true, onChange: value => changeField("locationId", value) })}
    {E.pick("Finished goods bin", view.binId, view.bins.filter(row => row.location_id === view.locationId).map(row => ({ value: row.id, label: row.name })), { disabled, required: true, onChange: value => changeField("binId", value) })}
    <PackagingMaterialActuals plan={view.plan} rows={view.actuals} locations={view.locations} bins={view.bins} disabled={disabled} onChange={changeActual} onAdd={addActual} onRemove={dropActual} />
    {messages}
    <IrreversibleSubmit label={retry ? "Retry unchanged close" : "Close packaging run"} type="button" reason={reason} disabled={disabled && !retry} onClick={onSubmit} />
  </div>;
}
