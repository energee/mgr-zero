// lib/mgr/fixtures/kegs.ts — keg fleet, balance, and history snapshots.
import type { KegBalanceSnapshot } from "@/lib/mgr/keg-balance-view";
import type { KegFleetViewModel } from "@/lib/mgr/keg-fleet-view";
import type { KegHistorySnapshot } from "@/lib/mgr/keg-history-view";
import type { KegReport } from "@/lib/mgr/keg-report-view";

export const kegFleetMicrostar: KegFleetViewModel = {
  poolForm: { name: "Microstar ⅙ bbl", kind: "pay_per_fill", vendorId: "microstar", perFill: "4.50", deposit: "30.00", active: true },
  vendors: [{ value: "microstar", label: "Kegline Leasing" }],
  bins: [
    { key: "wh", title: "Microstar ⅙ bbl · Warehouse", detail: "36 on hand · Walk-in", qty: "36" },
    { key: "st", title: "Microstar ⅙ bbl · Storage", detail: "40 on hand · Cold", qty: "40" },
  ],
  customerBalance: "Ridgeline · 38 out · $1,110",
  report: "9 unreturned over 90 days",
  history: "acquired, returned, lost, found, retired",
  eventForm: { poolId: "microstar", kegSize: "sixth_bbl", reason: "returned", locationId: "wh", binId: "walk-in", customerId: "ridgeline", qty: "4", note: "" },
  eventOptions: {
    pools: [{ value: "microstar", label: "Microstar ⅙ bbl" }],
    locations: [{ value: "wh", label: "Warehouse" }],
    bins: [{ value: "walk-in", label: "Walk-in" }],
    customers: [{ value: "ridgeline", label: "Ridgeline Tap Room" }, { value: "als", label: "Al’s Bar" }],
  },
  eventPreview: { qty: 4, name: "Ridgeline", from: "38", to: "34" },
};

export const kegBalanceRidgeline: KegBalanceSnapshot = {
  customer: "Ridgeline Tap Room",
  kegs: "38 kegs",
  deposits: "$1,110 deposits held",
  rows: [
    { key: "half", title: "Owned ½ bbl", detail: "34 out · $30 deposit each", trailing: "$1,020" },
    { key: "sixth", title: "Owned ⅙ bbl", detail: "4 out · 3 on deposit", trailing: "$90", warning: true },
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

export const kegReportOwned: KegReport = {
  fleet: { out: 142, total: 203, utilization: 142 / 203 },
  bySize: [{ pool_id: "owned", pool_name: "Owned", keg_size: "half_bbl", out: 124, total: 167 }, { pool_id: "owned", pool_name: "Owned", keg_size: "sixth_bbl", out: 18, total: 36 }],
  aging: [{ bucket: "0-30", kegs: 96, deposit_cents: 288000 }, { bucket: "31-60", kegs: 25, deposit_cents: 75000 }, { bucket: "61-90", kegs: 12, deposit_cents: 36000 }, { bucket: "90+", kegs: 9, deposit_cents: 27000 }],
  customers: [{ customer_id: "ridgeline", name: "Ridgeline Tap Room", over_90: 9, oldest_at: "2026-05-12T16:00:00+00:00" }],
  mismatches: [{ customer_id: "als", name: "Al’s Bar", pool_id: "owned", pool_name: "Owned", keg_size: "half_bbl", kegs_out: 2, kegs_on_deposit: 3 }],
};
