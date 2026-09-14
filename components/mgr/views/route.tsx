"use client";
import { useId, useState } from "react";
import { E } from "@/components/mgr/e";
import { DatePicker } from "@/components/mgr/date-picker";
import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { toggleRouteStop, type RouteViewModel } from "@/lib/mgr/route-view";

export type { RouteViewModel };

type Controls = Partial<Record<"date" | "driverId" | "vehicle" | "name", (value: string) => void>> & { selection?: (value: Record<string, number>) => void };

export function RouteView({ model, controls, busy = false, error, onSave, onDepart }: {
  model: RouteViewModel; controls?: Controls; busy?: boolean; error?: string | null; onSave?: () => void; onDepart?: () => void;
}) {
  const id = useId(), [draft, setDraft] = useState(model);
  const value = controls ? model : draft;
  const change = (patch: Partial<RouteViewModel>) => {
    setDraft({ ...value, ...patch });
    for (const key of ["date", "driverId", "vehicle", "name"] as const) if (patch[key] !== undefined) controls?.[key]?.(patch[key]);
    if (patch.selection) controls?.selection?.(patch.selection);
  };
  const ready = Boolean(value.date) && Object.keys(value.selection).length > 0;
  return <>
    {E.back(model.backTo ?? "Routes", model.title, undefined, model.backHref)}
    <form className="flex flex-col gap-4" onSubmit={event => { event.preventDefault(); if (!busy && ready) onSave?.(); }}>
      <fieldset disabled={busy}><DatePicker label="Delivery date" value={value.date ?? ""} onChange={date => change({ date })} /></fieldset>

      {E.pick("Driver", value.driverId ?? "", (model.driverOptions ?? []).map(driver => ({ value: driver.id, label: driver.label })), { onChange: driverId => change({ driverId }), disabled: busy, placeholder: "Not assigned", id: id + "-driver" })}
      {E.edit("Vehicle", value.vehicle ?? "", "text", undefined, { onChange: (nextValue: string) => change({ vehicle: nextValue }), id: id + "-vehicle", disabled: busy })}
      {E.edit("Route name", value.name ?? "", "text", undefined, { onChange: (nextValue: string) => change({ name: nextValue }), id: id + "-name", disabled: busy, placeholder: "Route A" })}
      {E.ttl("Stops")}
      {!model.stops?.length && E.blank("Nothing shipped is waiting for a route.")}
      {(model.stops ?? []).map(row => {
        const selected = row.key in value.selection;
        return <div key={row.key}>{E.row(
          <label className="flex items-center gap-3"><input type="checkbox" className="size-4 shrink-0 accent-primary" aria-label={row.title} checked={selected} disabled={busy || row.locked} onChange={event => change({ selection: toggleRouteStop(value.selection, row.key, event.target.checked) })} />{row.title}</label>,
          selected ? "stop " + value.selection[row.key] + (row.locked ? " · delivered" : "") : row.detail,
          selected ? E.edit("Stop number for " + row.title, String(value.selection[row.key]), "number", undefined, { onChange: (nextValue: string) => change({ selection: { ...value.selection, [row.key]: Number(nextValue) } }), disabled: busy || row.locked, required: true, min: "1", step: "1", hideLabel: true }) : "",
          row.warning && !selected ? "w" : "",
        )}</div>;
      })}
      <CommandFormMessage error={error} />
      <div className="flex flex-col gap-2 md:flex-row">
        <Button type="submit" variant={model.saved ? "outline" : "default"} className="w-full md:w-fit" disabled={busy || !ready}>{busy ? "Saving…" : "Save route plan"}</Button>
        {model.saved && <Button type="button" className="w-full md:w-fit" disabled={busy || !model.savedDriverId} onClick={onDepart}>Depart route</Button>}
      </div>
      {model.saved && !model.savedDriverId && E.note("Assign a driver and save before departing.")}
    </form>
  </>;
}
