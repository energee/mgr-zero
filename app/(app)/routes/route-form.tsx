// app/(app)/routes/route-form.tsx — the Route builder (screen record Route):
// date, driver, vehicle, name, and the stops as a checklist of this route's
// documents plus every shipped order and picked transfer on no route, each
// checked stop with its stop number. Save route plan → save_route; Depart
// route → depart_route once the route is saved. A departed route is read-only
// here; route-run.tsx takes over.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCommandAction } from "@/lib/commands/use-command-form";
import type { StopDoc } from "@/lib/commands/delivery";
import { driverLabel, type Route } from "./labels";

export function RouteForm({ route, candidates, drivers }: { route: Route | null; candidates: StopDoc[]; drivers: { user_id: string; role: string }[] }) {
  const router = useRouter();
  const [deliveryDate, setDeliveryDate] = useState(route?.delivery_date ?? new Date().toISOString().slice(0, 10));
  const [driverUserId, setDriverUserId] = useState(route?.driver_user_id ?? "");
  const [vehicle, setVehicle] = useState(route?.vehicle ?? "");
  const [name, setName] = useState(route?.name ?? "");
  const [stops, setStops] = useState<Record<string, number>>(() =>
    Object.fromEntries((route?.stops ?? []).map((s) => [s.shipment_id ?? s.stock_transfer_id ?? "", s.stop_no])));
  const { busy, error, run } = useCommandAction();
  const delivered = new Set((route?.stops ?? []).filter((s) => s.delivered_at).map((s) => s.shipment_id ?? s.stock_transfer_id));

  const toggle = (id: string, on: boolean) => setStops((prev) => {
    const next = { ...prev };
    if (on) next[id] = Math.max(0, ...Object.values(next)) + 1; else delete next[id];
    return next;
  });
  const input = () => ({
    id: route?.id, name: name || undefined, deliveryDate, driverUserId: driverUserId || undefined, vehicle: vehicle || undefined, note: route?.note ?? undefined,
    stops: candidates.filter((c) => c.id in stops).map((c) => ({ [c.kind === "shipment" ? "shipmentId" : "stockTransferId"]: c.id, stopNo: stops[c.id] })),
  });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (await run("save_route", input()) && !route) router.push("/routes");
  }
  const ready = deliveryDate && Object.keys(stops).length > 0;
  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="route-date">Delivery date</Label>
        <Input id="route-date" type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="route-driver">Driver</Label>
        <Select value={driverUserId} onValueChange={setDriverUserId}>
          <SelectTrigger id="route-driver"><SelectValue placeholder="Not assigned" /></SelectTrigger>
          <SelectContent>{drivers.map((d) => <SelectItem key={d.user_id} value={d.user_id}>{driverLabel(d.user_id)} · {d.role}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="route-vehicle">Vehicle</Label>
        <Input id="route-vehicle" value={vehicle} onChange={(e) => setVehicle(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="route-name">Route name</Label>
        <Input id="route-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Route A" />
      </div>
      <h2 className="mt-2 text-sm font-medium text-muted-foreground">Stops</h2>
      {candidates.length === 0 && <p className="text-sm text-muted-foreground">Nothing shipped is waiting for a route.</p>}
      {candidates.map((c) => {
        const on = c.id in stops;
        const locked = delivered.has(c.id);
        return (
          <div key={c.id} className="flex items-center gap-3">
            {/* ponytail: native checkbox; the ui kit has none and one is not worth a dependency */}
            <input type="checkbox" id={`stop-${c.id}`} className="size-4 accent-primary" checked={on} disabled={locked} onChange={(e) => toggle(c.id, e.target.checked)} />
            <Label htmlFor={`stop-${c.id}`} className="flex-1">{c.label}{locked ? " · delivered" : ""}</Label>
            {on && (
              <Input aria-label={`Stop number for ${c.label}`} type="number" min="1" step="1" className="w-16" value={stops[c.id]} disabled={locked}
                onChange={(e) => setStops((prev) => ({ ...prev, [c.id]: Number(e.target.value) }))} />
            )}
          </div>
        );
      })}
      <CommandFormMessage error={error} />
      <div className="flex flex-col gap-2 md:flex-row">
        <Button type="submit" variant={route ? "outline" : "default"} className="w-full md:w-fit" disabled={busy || !ready}>{busy ? "Saving…" : "Save route plan"}</Button>
        {route && (
          <Button type="button" className="w-full md:w-fit" disabled={busy || !route.driver_user_id} onClick={() => run("depart_route", { routeId: route.id })}>Depart route</Button>
        )}
      </div>
      {route && !route.driver_user_id && <p className="text-xs text-muted-foreground">Assign a driver and save before departing.</p>}
    </form>
  );
}
