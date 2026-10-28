// lib/mgr/fixtures/delivery.ts — route and confirm-delivery snapshots.
import type { ConfirmDeliveryViewModel } from "@/lib/mgr/confirm-delivery-view";
import type { DriverRouteViewModel } from "@/lib/mgr/driver-route-view";
import type { ReturnRouteViewModel } from "@/lib/mgr/return-route-view";
import type { RouteViewModel } from "@/lib/mgr/route-view";
import type { RoutesSnapshot } from "@/lib/mgr/routes-view";

export const routesDriver: RoutesSnapshot = {
  title: "Deliveries",
  subtitle: "",
  rows: [
    { key: "a", title: "Route A · Sep 10, 2026", detail: "Departed · 1 of 3 delivered", verb: "Resume", tone: "info" },
    { key: "b", title: "Route B · Sep 11, 2026", detail: "2 stops · driver not assigned", verb: "Assign", tone: "attention", warning: true },
    { key: "z", title: "Route Z · Sep 9, 2026", detail: "Departed · 2 of 2 delivered", verb: "Return", tone: "attention" },
    { key: "c", title: "Route C · Sep 12, 2026", detail: "2 stops · sam@example.test" },
    { key: "ord", title: "ORD-0236 · Ridgeline · Dock", detail: "Shipped · no route", verb: "Add to route", tone: "attention", warning: true },
    { key: "trf", title: "TRF-0004 · Storage", detail: "Shipped · no route", verb: "Add to route", tone: "attention", warning: true },
  ],
};

export const routeAPlan: RouteViewModel = {
  title: "Route A · Sep 10, 2026",
  date: "2026-09-10",
  driverId: "7f3a21c0",
  driverOptions: [{ id: "7f3a21c0", label: "sam@example.test · Warehouse" }, { id: "2b9e44d1", label: "riley@example.test · Admin" }],
  saved: true,
  savedDriverId: "7f3a21c0",
  selection: { s1: 1, s2: 2, s3: 3 },
  vehicle: "Box truck 2",
  name: "Route A",
  stops: [
    { key: "s1", title: "ORD-0231 · Ridgeline · Tap Room", detail: "stop 1" },
    { key: "s2", title: "ORD-0233 · Al’s Bar · Dock", detail: "stop 2" },
    { key: "s3", title: "TRF-0004 · Storage", detail: "stop 3" },
    { key: "s4", title: "ORD-0236 · Teresa’s · Dock", detail: "Shipped · no route", warning: true },
  ],
};

export const returnRouteA: ReturnRouteViewModel = {
  title: "Route A · Sep 10, 2026",
  driverVehicle: "sam@example.test · Box truck 2",
  departed: "8:10 AM",
  stops: [
    { key: "s1", title: "Stop 1 · ORD-0231 · Ridgeline · Tap Room", detail: "Delivered 8:42 AM" },
    { key: "s2", title: "Stop 2 · ORD-0233 · Al’s Bar · Dock", detail: "Partial 9:15 AM", outstanding: 2 },
    { key: "s3", title: "Stop 3 · TRF-0004 · Storage", detail: "Delivered 10:03 AM" },
  ],
};

export const driverRouteA: DriverRouteViewModel = {
  title: "Route A · Sep 10, 2026",
  driverVehicle: "sam@example.test · Box truck 2",
  departed: "8:10 AM",
  stops: [
    { key: "s1", title: "Stop 1 · ORD-0231 · Ridgeline · Tap Room", detail: "Next", verb: "Deliver", warning: true },
    { key: "s2", title: "Stop 2 · ORD-0233 · Al’s Bar · Dock", detail: "Later" },
    { key: "s3", title: "Stop 3 · TRF-0004 · Storage", detail: "Later" },
  ],
};

export const confirmDeliveryStop1: ConfirmDeliveryViewModel = {
  backTo: "Driver route",
  title: "Route A · Stop 1 of 3",
  heading: "Ridgeline Tap Room",
  shipTo: { label: "Tap Room", country: "US", address1: "123 Fictional Lane", address2: "Suite 4", city: "Phoenixville", state: "PA", zip: "19460" },
  invoiceTiming: "On delivery · saved",
  lines: [
    { key: "hazy", title: "Hazy IPA · ½ bbl keg", qty: "4" },
    { key: "pils", title: "Pils · 16 oz case", qty: "6" },
  ],
  receivedSuggestions: ["Dana", "Chris"],
};
