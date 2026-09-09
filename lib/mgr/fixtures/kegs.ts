// lib/mgr/fixtures/kegs.ts — keg fleet, balance, and history snapshots.
import type { KegBalanceSnapshot } from "@/lib/mgr/keg-balance-view";
import type { KegFleetViewModel } from "@/lib/mgr/keg-fleet-view";
import type { KegHistorySnapshot } from "@/lib/mgr/keg-history-view";

export const kegFleetMicrostar: KegFleetViewModel = {
  pool: "Microstar ⅙ bbl · 76 kegs · pay per fill",
  kind: "Owned",
  kindOptions: ["Owned", "Leased", "Pay per fill"],
  vendor: "none · owned pools have no vendor",
  perFill: "$0.00",
  bins: [
    { key: "wh", title: "Microstar ⅙ bbl · Warehouse", detail: "36 on hand · Walk-in", qty: "36" },
    { key: "st", title: "Microstar ⅙ bbl · Storage", detail: "40 on hand · Cold", qty: "40" },
  ],
  customerBalance: "Ridgeline · 38 out · $1,140",
  report: "9 unreturned over 90 days",
  history: "acquired, returned, lost, found, retired",
  eventKindIndex: 1,
  eventKinds: ["acquire", "return empty", "lost / found", "retire"],
  customer: "Ridgeline Tap Room",
  customerOptions: ["Ridgeline Tap Room", "Al’s Bar"],
  qty: 4,
  previewName: "Ridgeline",
  previewFrom: "38",
  previewTo: "34",
};

export const kegBalanceRidgeline: KegBalanceSnapshot = {
  customer: "Ridgeline Tap Room",
  kegs: "38 kegs",
  deposits: "$1,140 deposits held",
  rows: [
    { key: "half", title: "Owned ½ bbl", detail: "34 out · $30 deposit each", trailing: "$1,020" },
    { key: "sixth", title: "Owned ⅙ bbl", detail: "4 out · $30 deposit each", trailing: "$120" },
    { key: "over", title: "Over 90 days", detail: "9 kegs · oldest shipped 5/12/2026", trailing: "", verb: "Review history", warning: true },
  ],
};

export const kegHistoryLedger: KegHistorySnapshot = {
  customer: "All customers",
  customerOptions: ["All customers", "Ridgeline Tap Room", "Al’s Bar"],
  pool: "All pools",
  poolOptions: ["All pools", "Owned ½ bbl", "Owned ⅙ bbl"],
  rows: [
    { key: "r1", title: "Returned · Ridgeline", detail: "9/03 · 4 × Owned ½ bbl", who: "Dana", ok: true },
    { key: "r2", title: "Lost · Al’s Bar", detail: "9/01 · 1 × Owned ½ bbl", who: "Ali", warning: true },
    { key: "r3", title: "Found · Al’s Bar", detail: "8/30 · 1 × Owned ½ bbl", who: "Dana" },
    { key: "r4", title: "Acquired", detail: "8/28 · 12 × Owned ⅙ bbl", who: "Avery" },
    { key: "r5", title: "Retired", detail: "8/22 · 2 × Owned ½ bbl", who: "Avery" },
  ],
};
