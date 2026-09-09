// lib/mgr/fixtures/delivery.ts — route and confirm-delivery snapshots.
import type { ConfirmDeliveryViewModel } from "@/lib/mgr/confirm-delivery-view";
import type { DriverRouteViewModel } from "@/lib/mgr/driver-route-view";
import type { ReturnRouteViewModel } from "@/lib/mgr/return-route-view";
import type { RouteViewModel } from "@/lib/mgr/route-view";
import type { RoutesSnapshot } from "@/lib/mgr/routes-view";

export const routesDriver: RoutesSnapshot = {
  title: "Work",
  subtitle: "driver default",
  rows: [
    { key: "a", title: "Route A · 2026-09-10", detail: "departed · 1 of 3 delivered", verb: "Resume", tone: "info" },
    { key: "b", title: "Route B · 2026-09-11", detail: "2 stops · driver not assigned", verb: "Assign", tone: "attention", warning: true },
    { key: "ord", title: "ORD-0236 · Ridgeline · Dock", detail: "shipped · no route", verb: "Add to route", tone: "attention", warning: true },
    { key: "trf", title: "TRF-0004 · Storage", detail: "shipped · no route", verb: "Add to route", tone: "attention", warning: true },
  ],
};

export const routeAPlan: RouteViewModel = {
  title: "Route A · 2026-09-10",
  date: "2026-09-10",
  driver: "driver 7f3a21c0 · warehouse",
  driverOptions: ["driver 7f3a21c0 · warehouse", "driver 2b9e44d1 · admin"],
  vehicle: "Box truck 2",
  name: "Route A",
  stops: [
    { key: "s1", title: "ORD-0231 · Ridgeline · Tap Room", detail: "stop 1", trailing: "1" },
    { key: "s2", title: "ORD-0233 · Al’s Bar · Dock", detail: "stop 2", trailing: "2" },
    { key: "s3", title: "TRF-0004 · Storage", detail: "stop 3", trailing: "3" },
    { key: "s4", title: "ORD-0236 · Teresa’s · Dock", detail: "shipped · no route", warning: true },
  ],
};

export const returnRouteA: ReturnRouteViewModel = {
  title: "Route A · 2026-09-10",
  driverVehicle: "driver 7f3a21c0 · Box truck 2",
  departed: "8:10 AM",
  stops: [
    { key: "s1", title: "Stop 1 · ORD-0231 · Ridgeline · Tap Room", detail: "delivered 8:42 AM" },
    { key: "s2", title: "Stop 2 · ORD-0233 · Al’s Bar · Dock", detail: "delivered 9:15 AM" },
    { key: "s3", title: "Stop 3 · TRF-0004 · Storage", detail: "delivered 10:03 AM" },
  ],
};

export const driverRouteA: DriverRouteViewModel = {
  title: "Route A · 2026-09-10",
  driverVehicle: "driver 7f3a21c0 · Box truck 2",
  departed: "8:10 AM",
  stops: [
    { key: "s1", title: "Stop 1 · ORD-0231 · Ridgeline · Tap Room", detail: "next", verb: "Resume", warning: true },
    { key: "s2", title: "Stop 2 · ORD-0233 · Al’s Bar · Dock", detail: "later" },
    { key: "s3", title: "Stop 3 · TRF-0004 · Storage", detail: "later" },
  ],
};

export const confirmDeliveryStop1: ConfirmDeliveryViewModel = {
  backTo: "Driver route",
  title: "Route A · Stop 1 of 3",
  heading: "Ridgeline Tap Room",
  invoiceTiming: "On delivery · saved",
  lines: [
    { key: "hazy", title: "Hazy IPA · ½ bbl keg", qty: "4" },
    { key: "pils", title: "Pils · 16 oz case", qty: "6" },
  ],
  receivedSuggestions: ["Dana", "Chris"],
};
