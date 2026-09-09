// lib/mgr/fixtures/work.ts — list_work snapshot for the Work landing.
import type { WorkSnapshot } from "@/lib/mgr/work-view";

export const workWarehouse: WorkSnapshot = {
  subtitle: "warehouse default",
  rows: [
    { key: "ord1", title: "ORD-0231 · Ridgeline", detail: "submitted · ships today", verb: "Confirm", tone: "success", icon: "package" },
    { key: "ord2", title: "ORD-0229 · Al’s Bar", detail: "picked · restock 3 Pils staged", verb: "Put back", tone: "attention", warning: true, icon: "package" },
    { key: "po", title: "PO-0142 · Country Malt", detail: "due today", verb: "Receive", tone: "info", icon: "truck" },
    { key: "route", title: "Route A", detail: "3 stops · Thu", verb: "Resume", tone: "info", icon: "route" },
  ],
};
