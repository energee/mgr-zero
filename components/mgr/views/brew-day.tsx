"use client";
import { Fragment, useId, useState, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { DatePicker } from "@/components/mgr/date-picker";
import { brewCorrectionModel, brewSourceKey, canRecordBrewDay, type BrewActualDraft, type BrewDayViewModel, type BrewPlan } from "@/lib/mgr/brew-day-view";

import { INGREDIENT_STAGES, type IngredientStage } from "@/lib/mgr/recipe-process-view";

const processFields = [["preBoilBbl", "Pre-boil barrels"], ["boilMinutes", "Boil minutes"], ["whirlpoolMinutes", "Whirlpool minutes"], ["whirlpoolTempF", "Whirlpool °F"], ["whirlpoolRestMinutes", "Whirlpool rest minutes"], ["knockoutTempF", "Knockout °F"], ["mashWaterGal", "Mash water gallons"], ["spargeWaterGal", "Sparge water gallons"], ["targetMashPh", "Mash pH"]] as const;

import { PlanCancelled } from "./plan-actions";

export type { BrewDayViewModel };

export function BrewDayView({ model, busy = false, error, onChange, onRecord, planActions }: {
  planActions?: ReactNode;
  model: BrewDayViewModel; busy?: boolean; error?: string | null;
  onChange?: (patch: Partial<BrewDayViewModel>) => void;
  onRecord?: () => void;
}) {
  const id = useId(), [draft, setDraft] = useState(model);
  const value = onChange ? model : draft;
  const change = (patch: Partial<BrewDayViewModel>) => { setDraft({ ...value, ...patch }); onChange?.(patch); };
  const patchActual = (key: string, patch: Partial<BrewActualDraft>) => change({ actuals: (value.actuals ?? []).map(item => item.key === key ? { ...item, ...patch } : item) });
  const vessel = value.vessels.find(item => item.id === value.vesselId);
  const ready = canRecordBrewDay(value);
  const header = <>
    {E.back("Batches", model.title, undefined, model.backHref)}
    {model.planned && E.fld("Planned", model.planned)}
    {model.note && E.fld("Note", model.note)}
  </>;
  return <>
    {header}
    {!model.cancelled && !value.recorded && !value.correctionRecordId && planActions}
    {model.cancelled ? <PlanCancelled /> : value.recorded ? <>
      {E.fld("Vessel", model.vesselName || "No open occupancy")}
      {E.fld("Knockout", model.initialBbl ? model.initialBbl + " bbl" : "Unavailable after the occupancy closes")}
      {E.fld("Brewed on", model.brewedOn || "Unavailable")}
      {!(model.records?.length) && E.note("Historical frozen brew sheet unavailable. This brew predates confirmed material records.")}
      {(model.records ?? []).map(record => <section key={record.id} className="flex flex-col gap-2 rounded border p-3">
        {E.ttl(record.corrects_id ? "Corrected brew record" : "Original brew record")}
        {E.fld("Confirmed knockout", `${record.initial_bbl} bbl`)}
        {record.correction_reason && E.fld("Correction reason", record.correction_reason)}
        <BrewPlanSheet plan={record.plan_snapshot} frozen />
        {record.additions.map(row => <Fragment key={row.id}>{E.fld(row.material_name, `${row.confirmed_qty} ${row.unit} · ${row.stage} · ${row.lot_code ?? "Untracked"} · ${row.location_name} / ${row.bin_name}`)}</Fragment>)}
        {!record.additions.length && E.note("Confirmed no ingredients used.")}
        {processFields.map(([key, label]) => record.process[key] === undefined ? null : <Fragment key={key}>{E.fld(label, String(record.process[key]))}</Fragment>)}
      </section>)}
      {model.records?.length && model.vesselId ? E.act("Correct brew record", "attention", undefined, () => change(brewCorrectionModel(model, model.records!.at(-1)!)), busy) : null}
      {E.info("Already brewed. Cellar transfers and fermentation readings continue from the current occupancy, when one is open.")}
    </> : <form className="flex flex-col gap-4" onSubmit={event => { event.preventDefault(); if (!busy && ready) onRecord?.(); }}>

      {E.pick("Vessel", value.vesselId, value.vessels.map(item => ({ value: item.id, label: `${item.name} · ${item.kind} · ${Number(item.capacity_bbl)} bbl` })), { onChange: vesselId => change({ vesselId }), disabled: busy || Boolean(value.correctionRecordId), required: true, placeholder: "Choose vessel", id: id + "-vessel" })}
      {E.edit("Knockout barrels", value.initialBbl, "number", undefined, { onChange: (nextValue: string) => change({ initialBbl: nextValue }), id: id + "-bbl", disabled: busy, required: true, min: "0", step: "any" })}
      <fieldset disabled={busy || Boolean(value.correctionRecordId)}><DatePicker label="Brewed on" value={value.brewedOn} onChange={brewedOn => change({ brewedOn })} /></fieldset>
      {E.fld("Knockout baseline", ready ? <>{value.initialBbl} bbl {E.arrow()} {vessel?.name}</> : "Choose a vessel, positive barrels and a brew date")}
      {value.correctionRecordId && E.edit("Correction reason", value.correctionReason ?? "", "text", undefined, { onChange: correctionReason => change({ correctionReason }), required: true, disabled: busy })}
      <BrewPlanSheet plan={value.plan} frozen={Boolean(value.correctionRecordId)} />
      {E.ttl("Confirm actual ingredients")}
      {E.note("Mash, boil and whirlpool quantities start from the plan. Confirm each exact source and amount. Later fermentation, dry-hop and packaging additions stay planned. For water additions, enter actual use in the material's stock unit.")}
      {(value.actuals ?? []).map((row, index) => <fieldset key={row.key} disabled={busy} className="flex flex-col gap-2 rounded border p-3">
        {E.pick(`Material source ${index + 1}`, row.source, (value.sources ?? []).map(source => ({ value: brewSourceKey(source), label: `${source.material_name} · ${source.lot_code ?? "Untracked"} · ${source.location_name} / ${source.bin_name} · ${source.qty} ${source.unit} available` })), { required: true, forward: true, placeholder: "Choose exact source", onChange: source => patchActual(row.key, { source }) })}
        {E.pick("Stage", row.stage, [...INGREDIENT_STAGES], { onChange: stage => patchActual(row.key, { stage: stage as IngredientStage }) })}
        {E.edit("Actual quantity", row.qty, "number", undefined, { min: "0", step: "0.0001", required: true, onChange: qty => patchActual(row.key, { qty }) })}
        {E.btn("Remove ingredient", busy ? "g disabled" : "g", undefined, () => change({ actuals: value.actuals!.filter(item => item.key !== row.key) }))}
      </fieldset>)}
      {E.btn("Add ingredient", busy ? "g disabled" : "g", undefined, () => change({ actuals: [...(value.actuals ?? []), { key: crypto.randomUUID(), source: "", stage: "other", qty: "" }] }))}
      {!value.actuals?.length && <fieldset disabled={busy}><label className="flex items-center gap-2">{E.sw(Boolean(value.confirmEmpty), "Confirm no ingredients used", confirmEmpty => change({ confirmEmpty }))}Confirm no ingredients used</label></fieldset>}
      {E.ttl("Confirmed process observations")}
      {E.note("Leave observations blank when not measured. Recipe targets remain in the frozen plan.")}
      {processFields.map(([key, label]) => <Fragment key={key}>{E.edit(label, value.process?.[key] ?? "", "number", undefined, { disabled: busy, step: key.endsWith("Minutes") ? "1" : "any", onChange: next => change({ process: { ...value.process, [key]: next } }) })}</Fragment>)}
      {ready && E.tape([[<>Knockout {value.initialBbl} bbl {E.arrow()} {vessel?.name}</>, "loss baseline"]])}
      <CommandFormMessage error={error} />
      <Button type="submit" data-variant="irreversible" className="w-full bg-irreversible text-irreversible-foreground hover:bg-irreversible/90 md:w-fit" disabled={busy || !ready}>{value.correctionRecordId ? "Confirm correction" : "Record brew day"}</Button>
    </form>}
  </>;
}

function BrewPlanSheet({ plan, frozen }: { plan?: BrewPlan; frozen: boolean }) {
  return <>
      <details open><summary className="font-medium">{frozen ? "Frozen recipe plan" : "Pinned recipe plan"}</summary>
        {E.fld("Recipe", plan?.recipe ?? "No recipe")}
        {(plan?.ingredients ?? []).map(row => <Fragment key={row.id}>{E.fld(row.materialName, `${row.per_bbl_qty} ${row.unit} per bbl · ${row.stage}`)}</Fragment>)}
        {(plan?.version?.mash_schedule ?? []).map((row, index) => <Fragment key={index}>{E.fld(row.name, `${row.temp_f ?? row.tempF ?? "—"} °F · ${row.minutes} min`)}</Fragment>)}
        {(plan?.waterAdditions ?? []).map((row, index) => <Fragment key={index}>{E.fld(row.materialName, `${row.qty} ${row.unit} planned; confirm actual use in ${row.baseUnit}`)}</Fragment>)}
      </details>
  </>;
}
