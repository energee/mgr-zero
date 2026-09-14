"use client";
import { Fragment, useId, useState } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { DatePicker } from "@/components/mgr/date-picker";
import { canRecordBrewDay, type BrewDayViewModel } from "@/lib/mgr/brew-day-view";

export type { BrewDayViewModel };

export function BrewDayView({ model, busy = false, error, onChange, onRecord }: {
  model: BrewDayViewModel; busy?: boolean; error?: string | null;
  onChange?: (patch: Partial<Pick<BrewDayViewModel, "vesselId" | "initialBbl" | "brewedOn">>) => void;
  onRecord?: () => void;
}) {
  const id = useId(), [draft, setDraft] = useState(model);
  const value = onChange ? model : draft;
  const change = (patch: Partial<BrewDayViewModel>) => { setDraft({ ...value, ...patch }); onChange?.(patch); };
  const vessel = value.vessels.find(item => item.id === value.vesselId);
  const ready = canRecordBrewDay(value);
  return <>
    {E.back("Batches", model.title, undefined, model.backHref)}
    {model.planned && E.fld("Planned", model.planned)}
    {model.note && E.fld("Note", model.note)}
    <section data-gated className="flex flex-col gap-3" aria-label="Material consumption unavailable">
      {E.note("Material consumption unavailable here. Record brew day records the brew date and knockout occupancy only.")}
      {(model.lots ?? []).map(lot => <Fragment key={lot.key}>{E.nav(lot.title, lot.detail)}</Fragment>)}
      {model.tapeHead?.length ? E.tape(model.tapeHead) : null}
    </section>
    {model.recorded ? <>
      {E.fld("Vessel", model.vesselName || "No open occupancy")}
      {E.fld("Knockout", model.initialBbl ? model.initialBbl + " bbl" : "Unavailable after the occupancy closes")}
      {E.fld("Brewed on", model.brewedOn || "Unavailable")}
      {E.info("Already brewed. Cellar transfers and fermentation readings continue from the current occupancy, when one is open.")}
    </> : <form className="flex flex-col gap-4" onSubmit={event => { event.preventDefault(); if (!busy && ready) onRecord?.(); }}>

      {E.pick("Vessel", value.vesselId, value.vessels.map(item => ({ value: item.id, label: `${item.name} · ${item.kind} · ${Number(item.capacity_bbl)} bbl` })), { onChange: vesselId => change({ vesselId }), disabled: busy, required: true, placeholder: "Choose vessel", id: id + "-vessel" })}
      {E.edit("Knockout barrels", value.initialBbl, "number", undefined, { onChange: (nextValue: string) => change({ initialBbl: nextValue }), id: id + "-bbl", disabled: busy, required: true, min: "0", step: "any" })}
      <fieldset disabled={busy}><DatePicker label="Brewed on" value={value.brewedOn} onChange={brewedOn => change({ brewedOn })} /></fieldset>
      {E.fld("Knockout baseline", ready ? <>{value.initialBbl} bbl {E.arrow()} {vessel?.name}</> : "Choose a vessel, positive barrels and a brew date")}
      {model.sheet ? E.nav(model.sheet.title, model.sheet.detail) : <div data-gated>{E.note("Frozen brew sheet unavailable in this read.")}</div>}
      {ready && E.tape([[<>Knockout {value.initialBbl} bbl {E.arrow()} {vessel?.name}</>, "loss baseline"]])}
      <CommandFormMessage error={error} />
      <Button type="submit" data-variant="irreversible" className="w-full bg-irreversible text-irreversible-foreground hover:bg-irreversible/90 md:w-fit" disabled={busy || !ready}>Record brew day</Button>
    </form>}
  </>;
}
