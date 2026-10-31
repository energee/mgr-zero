// components/mgr/views/brew-timeline.tsx — a batch's Brew day tab as a
// timeline in process order: Mash → Lauter → Boil → Whirlpool → Knockout. Each
// stage heads with its recipe target and holds its ingredients (one tap
// confirms a row as pulled; Edit opens the same packs + loose field Prep uses)
// and its process readings; Edit also picks a source when stock is given.
// Knockout carries the vessel, barrels, brew date and knockout °F in one row on
// desk. On a phone the stages fold so one is open at a time, each heading
// saying how many of its ingredients are confirmed; from md up all show. Confirm
// all confirms every row at once; Record brew day stays in reach at the foot of
// a phone (BrewFooter), and Change plan is folded below. The live batch page
// mounts it for a planned batch; ./brew-day.tsx still draws recorded and
// cancelled batches (history, corrections, brew turns). Planned water additions
// are rows like any ingredient (waterAdditionRows); only one whose unit cannot
// become its material's base unit is listed under Mash as a reminder, recorded
// with Correct turn after the brew. A row is green only once confirmed with a
// source within stock (timelineTone).
"use client";
import { Fragment, useId, useState, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { IrreversibleSubmit } from "@/components/mgr/irreversible-submit";
import { DatePicker } from "@/components/mgr/date-picker";
import { anyPulled, confirmAll, currentStage, isShort, knockoutReady, processErrors, pullDetail, pulledQty, sourceChoices, stageProgress, timelineReason, timelineStages, timelineTone, type BrewIngredient, type BrewTimelineViewModel } from "@/lib/mgr/brew-prep-view";
import { vesselOptions } from "@/lib/mgr/brew-day-view";
import { packs } from "@/lib/mgr/pack-qty";
import { processFields } from "./brew-day";
import { BrewFooter, BrewTabs, ChangePlanFold, DetailParts, PackQuantity, PlannedLine, SourcePick } from "./brew-prep";

const processLabel = Object.fromEntries(processFields) as Record<string, string>;

/** Closed stages show on desk anyway: the fold is a phone affordance. */
const STAGE = "rounded border p-3 md:[&::details-content]:[content-visibility:visible] md:[&::details-content]:block";

/** On a phone a row's Edit and Confirm take their own full-width line under the detail, at a 44px glove-friendly height. */
const ROW_ACTIONS = "max-md:[&_[data-slot=item-actions]]:basis-full";
const ACTION = "max-md:h-11 max-md:flex-1";

/** planActions (reschedule / cancel) is folded at the foot (ChangePlanFold), outside the record form, so its own fields
 *  never submit Record brew day. tabHrefs are the live page's tab links (see BrewTabs). */
export function BrewTimelineView({ model, busy = false, error, onChange, onRecord, planActions, tabHrefs }: {
  model: BrewTimelineViewModel; busy?: boolean; error?: string | null; planActions?: ReactNode; tabHrefs?: Record<string, string>;
  onChange?: (patch: Partial<BrewTimelineViewModel>) => void;
  onRecord?: () => void;
}) {
  const id = useId(), [draft, setDraft] = useState(model), [editing, setEditing] = useState<string | null>(null);
  const value = onChange ? model : draft;
  const change = (patch: Partial<BrewTimelineViewModel>) => { setDraft({ ...value, ...patch }); onChange?.(patch); };
  const patchRow = (key: string, patch: Partial<BrewIngredient>) => change({ ingredients: value.ingredients.map(row => row.key === key ? { ...row, ...patch } : row) });
  const vessel = value.vessels.find(item => item.id === value.vesselId);
  const open = currentStage(value), reason = timelineReason(value);
  const errors = processErrors(value.process);
  const reading = (key: string) => <Fragment key={key}>{E.edit(processLabel[key], value.process[key] ?? "", "number", undefined, { id: `${id}-${key}`, error: errors[key], disabled: busy, step: key.endsWith("Minutes") ? "1" : "any", onChange: next => change({ process: { ...value.process, [key]: next } }) })}</Fragment>;
  const ingredient = (row: BrewIngredient) => {
    const choices = sourceChoices(value.sources ?? [], row.materialId);
    return <div key={row.key} className={ROW_ACTIONS}>
      {E.row(row.name, <DetailParts text={isShort(row) ? `pulled ${packs(pulledQty(row), row.packSize, row.unit)} · ${pullDetail(row)}` : pullDetail(row)} />,
        <div className="flex items-center gap-1 max-md:w-full">
          <Button type="button" size="sm" variant="ghost" className={ACTION} data-preview-action aria-label={`Edit ${row.name}`} aria-expanded={editing === row.key} disabled={busy} onClick={() => setEditing(editing === row.key ? null : row.key)}>Edit</Button>
          <Button type="button" size="sm" variant={row.confirmed ? "secondary" : "outline"} className={ACTION} data-preview-action aria-pressed={Boolean(row.confirmed)} aria-label={`${row.name} pulled`} disabled={busy} onClick={() => patchRow(row.key, { confirmed: !row.confirmed })}>{row.confirmed ? "Pulled" : "Confirm"}</Button>
        </div>,
        timelineTone(row, value.sources), undefined,
        editing === row.key ? <div className="flex flex-col gap-2">
          <PackQuantity row={row} disabled={busy} onChange={patch => patchRow(row.key, patch)} />
          {choices.length > 0 && <SourcePick row={row} choices={choices} disabled={busy} onChange={source => patchRow(row.key, { source })} />}
        </div> : undefined)}
    </div>;
  };
  return <>
    {E.back("Batches", model.title, undefined, model.backHref)}
    <BrewTabs on={1} hrefs={tabHrefs} />
    <PlannedLine planned={model.planned} note={model.note} />
    <form className="flex flex-col gap-4" onSubmit={event => { event.preventDefault(); if (!busy && !reason) onRecord?.(); }}>
      {value.ingredients.some(row => !row.confirmed) && <div className="self-start">{E.act("Confirm all", "success", undefined, () => change({ ingredients: confirmAll(value.ingredients) }), busy)}</div>}
      {timelineStages(value).map(stage => <details key={stage.stage} name={id + "-stage"} open={stage.stage === open || undefined} className={STAGE}>
        <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-x-2 md:cursor-auto md:list-none">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium">{stage.label}</span>
            {stageProgress(stage.ingredients) && <span className="text-xs text-muted-foreground">{stageProgress(stage.ingredients)}</span>}
          </span>
          {value.targets[stage.stage] && <span className="text-sm text-muted-foreground">{value.targets[stage.stage]}</span>}
        </summary>
        <div className="mt-2 flex flex-col gap-3">
          {stage.ingredients.map(ingredient)}
          {stage.stage === "mash" && (value.waterAdditions ?? []).map((row, index) => <Fragment key={index}>{E.fld(row.materialName, `${row.qty} ${row.unit} planned · add with Correct turn after recording`)}</Fragment>)}
          {stage.stage === "knockout" ? <>
            {E.cols(
              E.pick("Vessel", value.vesselId, vesselOptions(value.vessels), { onChange: vesselId => change({ vesselId }), disabled: busy, required: true, placeholder: "Choose vessel", id: id + "-vessel" }),
              E.edit("Knockout barrels", value.initialBbl, "number", undefined, { onChange: initialBbl => change({ initialBbl }), id: id + "-bbl", disabled: busy, required: true, min: "0", step: "any" }),
              <fieldset disabled={busy}><DatePicker label="Brewed on" value={value.brewedOn} onChange={brewedOn => change({ brewedOn })} /></fieldset>,
              ...stage.process.map(reading),
            )}
            {knockoutReady(value)
              ? E.tape([[<>Knockout {value.initialBbl} bbl {E.arrow()} {vessel?.name}</>, "loss baseline"]])
              : E.fld("Knockout baseline", "Choose a vessel, positive barrels and a brew date")}
          </> : stage.process.length > 0 && <div className="md:max-w-2xl">{E.cols(...stage.process.map(reading))}</div>}
        </div>
      </details>)}
      {!anyPulled(value) && <fieldset disabled={busy}><label className="flex items-center gap-2">{E.sw(Boolean(value.confirmEmpty), "Confirm no ingredients used", confirmEmpty => change({ confirmEmpty }))}Confirm no ingredients used</label></fieldset>}
      <CommandFormMessage error={error} />
      <BrewFooter>
        <IrreversibleSubmit label="Record brew day" reason={reason} submitting={busy} busy="Recording…" />
      </BrewFooter>
    </form>
    <ChangePlanFold open={value.overdue}>{planActions}</ChangePlanFold>
  </>;
}
