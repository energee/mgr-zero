// app/(app)/routes/route-form.tsx — the Route builder (screen record Route):
// date, driver, vehicle, name, and the stops as a checklist of this route's
// documents plus every shipped order and picked transfer on no route, each
// checked stop with its stop number. Save route plan → save_route; Depart
// route → depart_route once the route is saved. A departed route is read-only
// here; route-run.tsx takes over.
"use client";

import { useState } from "react";
import { RouteView } from "@/components/mgr/views/route";
import { useRouter } from "next/navigation";
import { useCommandAction } from "@/lib/commands/use-command-form";
import type { StopDoc } from "@/lib/commands/delivery";
import { driverLabel, type Route } from "./labels";

export function RouteForm({ route, candidates, drivers, today }: { route: Route | null; candidates: StopDoc[]; drivers: { user_id: string; role: string }[]; today: string }) {
  const router = useRouter();
  const [deliveryDate, setDeliveryDate] = useState(route?.delivery_date ?? today);
  const [driverUserId, setDriverUserId] = useState(route?.driver_user_id ?? "");
  const [vehicle, setVehicle] = useState(route?.vehicle ?? "");
  const [name, setName] = useState(route?.name ?? "");
  const [stops, setStops] = useState<Record<string, number>>(() =>
    Object.fromEntries((route?.stops ?? []).map((s) => [s.shipment_id ?? s.stock_transfer_id ?? "", s.stop_no])));
  const { busy, error, run } = useCommandAction();
  const delivered = new Set((route?.stops ?? []).filter((s) => s.delivered_at).map((s) => s.shipment_id ?? s.stock_transfer_id));

  const input = () => ({
    id: route?.id, name: name || undefined, deliveryDate, driverUserId: driverUserId || undefined, vehicle: vehicle || undefined, note: route?.note ?? undefined,
    stops: candidates.filter((c) => c.id in stops).map((c) => ({ [c.kind === "shipment" ? "shipmentId" : "stockTransferId"]: c.id, stopNo: stops[c.id] })),
  });
  async function save() {
    if (await run("save_route", input()) && !route) router.push("/routes");
  }
  return <RouteView model={{
    title: route ? (route.name ?? "Route") + " · " + route.delivery_date : "New route", backTo: "Deliveries", backHref: "/routes",
    date: deliveryDate, driverId: driverUserId, vehicle, name, selection: stops, saved: Boolean(route), savedDriverId: route?.driver_user_id,
    driverOptions: drivers.map(driver => ({ id: driver.user_id, label: driverLabel(driver.user_id) + " · " + driver.role })),
    stops: candidates.map(candidate => ({ key: candidate.id, title: candidate.label, detail: "shipped · no route", locked: delivered.has(candidate.id), warning: !(candidate.id in stops) })),
  }} controls={{ date: setDeliveryDate, driverId: setDriverUserId, vehicle: setVehicle, name: setName, selection: setStops }} busy={busy} error={error}
    onSave={() => { void save(); }} onDepart={() => { if (route) void run("depart_route", { routeId: route.id }); }}
  />;
}
