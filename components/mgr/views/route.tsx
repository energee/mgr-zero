// components/mgr/views/route.tsx — shared Route builder (planned route): date,
// driver, vehicle, name and ordered stops. Save route plan names what it still
// needs (routeReason); Depart route waits for a saved driver. A new route with
// no stop to plan shows only its empty state: the form would have nothing to save.
"use client";
import { useId, useState } from "react";
import { E } from "@/components/mgr/e";
import { DatePicker } from "@/components/mgr/date-picker";
import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { routeReason, toggleRouteStop, type RouteViewModel } from "@/lib/mgr/route-view";

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
  const reason = routeReason(value);
  const noStops = !model.stops?.length && E.blank({
    title: "No stops ready for a route",
    description: "In Orders, confirm an order, pick its stock, then ship it. Shipped delivery orders appear here until assigned to a route. Pickup orders do not appear. Picked stock transfers also appear here.",
  }, undefined, E.act("Open Orders", "primary", model.ordersHref));
  return <>
    {E.back("Deliveries", model.title, undefined, model.backHref, "Routes")}
    {noStops && !model.saved ? noStops : <form className="flex flex-col gap-4" onSubmit={event => { event.preventDefault(); if (!busy && !reason) onSave?.(); }}>
      <fieldset disabled={busy}><DatePicker label="Delivery date" value={value.date ?? ""} onChange={date => change({ date })} /></fieldset>

      {E.pick("Driver", value.driverId ?? "", (model.driverOptions ?? []).map(driver => ({ value: driver.id, label: driver.label })), { onChange: driverId => change({ driverId }), disabled: busy, placeholder: "Not assigned", id: id + "-driver" })}
      {E.edit("Vehicle", value.vehicle ?? "", "text", undefined, { onChange: (nextValue: string) => change({ vehicle: nextValue }), id: id + "-vehicle", disabled: busy })}
      {E.edit("Route name", value.name ?? "", "text", undefined, { onChange: (nextValue: string) => change({ name: nextValue }), id: id + "-name", disabled: busy, placeholder: "Route A" })}
      {E.ttl("Stops")}
      {noStops}
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
      {E.pin(<>
        {E.submit("Save route plan", { submitting: busy, reason, variant: model.saved ? "outline" : "default" })}
        {model.saved && <Button type="button" disabled={busy || !model.savedDriverId} onClick={onDepart}>Depart route</Button>}
      </>)}
      {model.saved && !model.savedDriverId && E.note("Assign a driver and save before departing.")}
    </form>}
  </>;
}
