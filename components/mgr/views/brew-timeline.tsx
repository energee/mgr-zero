// components/mgr/views/brew-timeline.tsx — a batch's Brew day tab as a
// timeline in process order: Mash → Lauter → Boil → Whirlpool → Knockout. Each
// stage heads with its recipe target and holds its ingredients (one tap
// confirms a row as pulled; Edit opens the same packs + loose field Prep uses)
// and its process readings. Knockout carries the vessel, barrels and brew date.
// On a phone the stages fold so one is open at a time; from md up all show.
// Kept apart from ./brew-day.tsx, which the live batch page still mounts.
"use client";
import { Fragment, useId, useState } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { DatePicker } from "@/components/mgr/date-picker";
import { canRecordTimeline, currentStage, isShort, knockoutReady, pullDetail, pulledQty, timelineStages, type BrewIngredient, type BrewTimelineViewModel } from "@/lib/mgr/brew-prep-view";
import { vesselOptions } from "@/lib/mgr/brew-day-view";
import { packs } from "@/lib/mgr/pack-qty";
import { processFields } from "./brew-day";
import { BrewTabs, PackQuantity } from "./brew-prep";

export type { BrewTimelineViewModel };

const processLabel = Object.fromEntries(processFields) as Record<string, string>;

/** Closed stages show on desk anyway: the fold is a phone affordance. */
const STAGE = "rounded border p-3 md:[&::details-content]:[content-visibility:visible] md:[&::details-content]:block";

export function BrewTimelineView({ model, busy = false, error, onChange, onRecord }: {
  model: BrewTimelineViewModel; busy?: boolean; error?: string | null;
  onChange?: (patch: Partial<BrewTimelineViewModel>) => void;
  onRecord?: () => void;
}) {
  const id = useId(), [draft, setDraft] = useState(model), [editing, setEditing] = useState<string | null>(null);
  const value = onChange ? model : draft;
  const change = (patch: Partial<BrewTimelineViewModel>) => { setDraft({ ...value, ...patch }); onChange?.(patch); };
  const patchRow = (key: string, patch: Partial<BrewIngredient>) => change({ ingredients: value.ingredients.map(row => row.key === key ? { ...row, ...patch } : row) });
  const vessel = value.vessels.find(item => item.id === value.vesselId);
  const open = currentStage(value), ready = canRecordTimeline(value);
  const reading = (key: string) => <Fragment key={key}>{E.edit(processLabel[key], value.process[key] ?? "", "number", undefined, { disabled: busy, step: key.endsWith("Minutes") ? "1" : "any", onChange: next => change({ process: { ...value.process, [key]: next } }) })}</Fragment>;
  const ingredient = (row: BrewIngredient) => <div key={row.key}>
    {E.row(row.name, isShort(row) ? `pulled ${packs(pulledQty(row), row.packSize, row.unit)} · ${pullDetail(row)}` : pullDetail(row),
      <div className="flex items-center gap-1">
        <Button type="button" size="sm" variant="ghost" data-preview-action aria-label={`Edit ${row.name}`} aria-expanded={editing === row.key} disabled={busy} onClick={() => setEditing(editing === row.key ? null : row.key)}>Edit</Button>
        <Button type="button" size="sm" variant={row.confirmed ? "secondary" : "outline"} data-preview-action aria-pressed={Boolean(row.confirmed)} aria-label={`${row.name} pulled`} disabled={busy} onClick={() => patchRow(row.key, { confirmed: !row.confirmed })}>{row.confirmed ? "Pulled" : "Confirm"}</Button>
      </div>,
      row.confirmed ? "ok" : isShort(row) ? "w" : "", undefined,
      editing === row.key ? <PackQuantity row={row} disabled={busy} onChange={patch => patchRow(row.key, patch)} /> : undefined)}
  </div>;
  return <form className="flex flex-col gap-4" onSubmit={event => { event.preventDefault(); if (!busy && ready) onRecord?.(); }}>
    {E.back("Batches", model.title, undefined, model.backHref)}
    <BrewTabs on={1} />
    {timelineStages(value).map(stage => <details key={stage.stage} name={id + "-stage"} open={stage.stage === open || undefined} className={STAGE}>
      <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-x-2 md:cursor-auto md:list-none">
        <span className="font-medium">{stage.label}</span>
        {value.targets[stage.stage] && <span className="text-sm text-muted-foreground">{value.targets[stage.stage]}</span>}
      </summary>
      <div className="mt-2 flex flex-col gap-3">
        {stage.ingredients.map(ingredient)}
        {stage.stage === "knockout" && <>
          {E.pick("Vessel", value.vesselId, vesselOptions(value.vessels), { onChange: vesselId => change({ vesselId }), disabled: busy, required: true, placeholder: "Choose vessel", id: id + "-vessel" })}
          {E.edit("Knockout barrels", value.initialBbl, "number", undefined, { onChange: initialBbl => change({ initialBbl }), id: id + "-bbl", disabled: busy, required: true, min: "0", step: "any" })}
          <fieldset disabled={busy}><DatePicker label="Brewed on" value={value.brewedOn} onChange={brewedOn => change({ brewedOn })} /></fieldset>
        </>}
        {E.cols(...stage.process.map(reading))}
        {stage.stage === "knockout" && knockoutReady(value) && E.tape([[<>Knockout {value.initialBbl} bbl {E.arrow()} {vessel?.name}</>, "loss baseline"]])}
      </div>
    </details>)}
    <CommandFormMessage error={error} />
    <Button type="submit" data-variant="irreversible" className="w-full bg-irreversible text-irreversible-foreground hover:bg-irreversible/90 md:w-fit md:self-end" disabled={busy || !ready}>Record brew day</Button>
  </form>;
}
