"use client";
import { cloneElement, Fragment, useId, useState, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { formatDate } from "@/lib/date-format";
import { sentenceCase } from "@/lib/mgr/labels";
import { bblExact } from "@/lib/volume";
import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { DatePicker } from "@/components/mgr/date-picker";
import { brewCorrectionModel, brewTurnModel, currentBrewRecords, showsTurnKnockout, brewSourceKey, canRecordBrewDay, vesselOptions, type BrewActualDraft, type BrewDayViewModel, type BrewPlan } from "@/lib/mgr/brew-day-view";

import { perBblDisplay, type IngredientStage } from "@/lib/mgr/recipe-process-view";
import { INGREDIENT_STAGE_OPTIONS } from "./ingredient";

/** record_brew_day process keys and their labels; the Brew day timeline (./brew-timeline) regroups them by stage. */
export const processFields = [["preBoilBbl", "Pre-boil barrels"], ["boilMinutes", "Boil minutes"], ["whirlpoolMinutes", "Whirlpool minutes"], ["whirlpoolTempF", "Whirlpool °F"], ["whirlpoolRestMinutes", "Whirlpool rest minutes"], ["knockoutTempF", "Knockout °F"], ["mashWaterGal", "Mash water gallons"], ["spargeWaterGal", "Sparge water gallons"], ["targetMashPh", "Mash pH"]] as const;

import { PlanCancelled } from "./plan-actions";

/** `actions` are a recorded batch's cellar verbs for its open occupancy (Reading, Transfer, Addition,
 *  Complete batch), drawn first so the batch page is not a dead end (#1508). */
export function BrewDayView({ model, busy = false, error, onChange, onRecord, actions }: {
  model: BrewDayViewModel; busy?: boolean; error?: string | null;
  onChange?: (patch: Partial<BrewDayViewModel>) => void;
  onRecord?: () => void; actions?: ReactNode;
}) {
  const id = useId(), [draft, setDraft] = useState(model);
  const value = onChange ? model : draft;
  const change = (patch: Partial<BrewDayViewModel>) => { setDraft({ ...value, ...patch }); onChange?.(patch); };
  const patchActual = (key: string, patch: Partial<BrewActualDraft>) => change({ actuals: (value.actuals ?? []).map(item => item.key === key ? { ...item, ...patch } : item) });
  const vessel = value.vessels.find(item => item.id === value.vesselId);
  const ready = canRecordBrewDay(value);
  let knockoutBaseline: ReactNode = "Choose a vessel, positive barrels and a brew date";
  if (value.correctionRecordId) knockoutBaseline = `${value.initialBbl} bbl · recorded turn`;
  else if (ready) knockoutBaseline = <>{value.initialBbl} bbl {E.arrow()} {vessel?.name}</>;
  const header = <>
    {E.back("Batches", model.title, undefined, model.backHref)}
    {model.planned && E.fld(model.cancelled ? "Cancelled" : "Planned", model.planned)}
    {model.note && E.fld("Note", model.note)}
  </>;
  return <>
    {header}
    {model.cancelled ? <PlanCancelled /> : value.recorded ? <>
      {actions}
      {E.fld("Vessel", model.vesselName || "No open occupancy")}
      {E.fld("Knockout", model.initialBbl ? model.initialBbl + " bbl" : "Unavailable after the occupancy closes")}
      {E.fld("Brewed on", model.brewedOn ? formatDate(model.brewedOn) : "Unavailable")}
      {model.completion && <>
        {E.fld("Completed", model.completion.on)}
        {E.fld("Packaged", bblExact(model.completion.packagedBbl, 8))}
        {E.fld("Written off as loss", model.completion.writeOffBbl === null ? "None" : bblExact(model.completion.writeOffBbl, 8))}
      </>}
      {!(model.records?.length) && E.note("Historical frozen brew sheet unavailable. This brew predates confirmed material records.")}
      {(model.records ?? []).map(record => <section key={record.id} className="flex flex-col gap-2 rounded border p-3">
        {E.ttl(`Turn ${record.turn} · ${record.corrects_id ? "Corrected brew record" : "Original brew record"}`)}
        {showsTurnKnockout(model.records ?? [], model.initialBbl) && E.fld("Confirmed knockout", `${record.initial_bbl} bbl`)}
        {record.correction_reason && E.fld("Correction reason", record.correction_reason)}
        <BrewPlanSheet plan={record.plan_snapshot} frozen />
        {record.additions.map(row => <Fragment key={row.id}>{E.fld(row.material_name, `${row.confirmed_qty} ${row.unit} · ${sentenceCase(row.stage)} · ${row.lot_code ?? "Untracked"} · ${row.location_name} / ${row.bin_name}`)}</Fragment>)}
        {!record.additions.length && E.note("Confirmed no ingredients used.")}
        {processFields.map(([key, label]) => record.process[key] === undefined ? null : <Fragment key={key}>{E.fld(label, String(record.process[key]))}</Fragment>)}
      </section>)}
      {currentBrewRecords(model.records ?? []).map(record => <Fragment key={record.id}>{cloneElement(E.act(`Correct turn ${record.turn}`, "attention", undefined, () => change(brewCorrectionModel(model, record)), busy), { "data-preview-action": true } as Record<string, unknown>)}</Fragment>)}
      {model.vesselId && model.records?.length ? cloneElement(E.act("Add brew turn", "attention", undefined, () => change(brewTurnModel(model)), busy), { "data-preview-action": true } as Record<string, unknown>) : null}
      {!model.completion && E.info("Already brewed. Cellar transfers and fermentation readings continue from the current occupancy, when one is open.")}
    </> : <form className="flex flex-col gap-4" onSubmit={event => { event.preventDefault(); if (!busy && ready) onRecord?.(); }}>

      {value.correctionRecordId ? E.fld("Vessel", "Fixed by the recorded turn") : E.pick("Vessel", value.vesselId, vesselOptions(value.vessels), { onChange: vesselId => change({ vesselId }), disabled: busy || Boolean(value.addingTurn), required: true, placeholder: "Choose vessel", id: id + "-vessel" })}
      {E.edit("Knockout barrels", value.initialBbl, "number", undefined, { onChange: (nextValue: string) => change({ initialBbl: nextValue }), id: id + "-bbl", disabled: busy, required: true, min: "0", step: "any" })}
      <fieldset disabled={busy || Boolean(value.correctionRecordId)}><DatePicker label="Brewed on" value={value.brewedOn} onChange={brewedOn => change({ brewedOn })} /></fieldset>
      {E.fld("Knockout baseline", knockoutBaseline)}
      {value.correctionRecordId && E.edit("Correction reason", value.correctionReason ?? "", "text", undefined, { onChange: correctionReason => change({ correctionReason }), required: true, disabled: busy })}
      <BrewPlanSheet plan={value.plan} frozen={Boolean(value.correctionRecordId)} />
      {E.ttl("Confirm actual ingredients")}
      {E.note("Mash, boil and whirlpool quantities start from the plan. Confirm each exact source and amount. Later fermentation, dry-hop and packaging additions stay planned. For water additions, enter actual use in the material's stock unit.")}
      {(value.actuals ?? []).map((row, index) => <fieldset key={row.key} disabled={busy} className="flex flex-col gap-2 rounded border p-3">
        {E.pick(`Material source ${index + 1}`, row.source, (value.sources ?? []).map(source => ({ value: brewSourceKey(source), label: `${source.material_name} · ${source.lot_code ?? "Untracked"} · ${source.location_name} / ${source.bin_name} · ${source.qty} ${source.unit} available` })), { required: true, forward: true, placeholder: "Choose exact source", onChange: source => patchActual(row.key, { source }) })}
        {E.pick("Stage", row.stage, INGREDIENT_STAGE_OPTIONS, { onChange: stage => patchActual(row.key, { stage: stage as IngredientStage }) })}
        {E.edit("Actual quantity", row.qty, "number", undefined, { min: "0", step: "0.0001", required: true, onChange: qty => patchActual(row.key, { qty }) })}
        {E.btn("Remove ingredient", busy ? "g disabled" : "g", undefined, () => change({ actuals: value.actuals!.filter(item => item.key !== row.key) }))}
      </fieldset>)}
      {E.btn("Add ingredient", busy ? "g disabled" : "g", undefined, () => change({ actuals: [...(value.actuals ?? []), { key: crypto.randomUUID(), source: "", stage: "other", qty: "" }] }))}
      {!value.actuals?.length && <fieldset disabled={busy}><label className="flex items-center gap-2">{E.sw(Boolean(value.confirmEmpty), "Confirm no ingredients used", confirmEmpty => change({ confirmEmpty }))}Confirm no ingredients used</label></fieldset>}
      {E.ttl("Confirmed process observations")}
      {E.note("Leave observations blank when not measured. Recipe targets remain in the frozen plan.")}
      {processFields.map(([key, label]) => <Fragment key={key}>{E.edit(label, value.process?.[key] ?? "", "number", undefined, { disabled: busy, step: key.endsWith("Minutes") ? "1" : "any", onChange: next => change({ process: { ...value.process, [key]: next } }) })}</Fragment>)}
      {ready && E.tape([[knockoutBaseline, "loss baseline"]])}
      <CommandFormMessage error={error} />
      <Button type="submit" data-variant="irreversible" className="w-full bg-irreversible text-irreversible-foreground hover:bg-irreversible/90 md:w-fit" disabled={busy || !ready}>{value.correctionRecordId ? "Confirm correction" : value.addingTurn ? "Record brew turn" : "Record brew day"}</Button>
    </form>}
  </>;
}

function BrewPlanSheet({ plan, frozen }: { plan?: BrewPlan; frozen: boolean }) {
  const version = plan?.version?.version;
  const recipe = plan?.recipe && version ? `${plan.recipe} v${version}` : plan?.recipe;
  return <>
      <details><summary className="font-medium">{frozen ? "Frozen recipe plan" : "Pinned recipe plan"}</summary>
        {E.fld("Recipe", recipe ?? "No recipe")}
        {(plan?.ingredients ?? []).map(row => <Fragment key={row.id}>{E.fld(row.materialName, `${perBblDisplay(row.per_bbl_qty)} ${row.unit} per bbl · ${sentenceCase(row.stage)}`)}</Fragment>)}
        {(plan?.version?.mash_schedule ?? []).map((row, index) => <Fragment key={index}>{E.fld(row.name, `${row.temp_f ?? row.tempF ?? "—"} °F · ${row.minutes} min`)}</Fragment>)}
        {(plan?.waterAdditions ?? []).map((row, index) => <Fragment key={index}>{E.fld(row.materialName, `${row.qty} ${row.unit} planned; confirm actual use in ${row.baseUnit}`)}</Fragment>)}
      </details>
  </>;
}
