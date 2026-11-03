// lib/mgr/fixtures/inventory.ts — get_on_hand / get_atp / record_movement
// snapshots for Finished goods, Record movement and Reverse movement.
// Identities from demo.ts. Views own no sample data.
import { SKU_HAZY, SKU_PILS, SKU_STOUT, LOC_WAREHOUSE, LOC_TAPROOM } from "./demo";
import type { FinishedGoodsMovements, FinishedGoodsSnapshot } from "@/lib/mgr/finished-goods-view";
import type { RecordMovementSnapshot } from "@/lib/mgr/record-movement-view";
import type { ReverseMovementSnapshot } from "@/lib/mgr/reverse-movement-view";
import { formatDateTime } from "@/lib/date-format";
import { DEMO_TIME_ZONE } from "./settings";

/** Beer → Finished goods: Hazy / Pils shortfall / Stout. */
export const finishedGoodsList: FinishedGoodsSnapshot = {
  value: { cents: 1248000, uncostedUnits: 6 },
  skus: [
    { id: SKU_HAZY.sku_id, name: SKU_HAZY.name, on_hand: 15, atp: 11 },
    { id: SKU_PILS.sku_id, name: SKU_PILS.name, on_hand: 18, atp: -6 },
    { id: SKU_STOUT.sku_id, name: SKU_STOUT.name, on_hand: 9, atp: 7 },
  ],
};

export const finishedGoodsEmpty: FinishedGoodsSnapshot = {
  value: { cents: 0, uncostedUnits: 0 },
  skus: [],
};

/** Festival removal of one Hazy ½ bbl keg from Warehouse · Cold into PA. */
export const recordMovementFestival: RecordMovementSnapshot = {
  kind: "festival_removal",
  sku: SKU_HAZY.name,
  location: LOC_WAREHOUSE.name,
  locationOptions: [LOC_WAREHOUSE.name, LOC_TAPROOM.name],
  bin: "Cold",
  binOptions: ["Cold", "Dry", "Walk-in"],
  channel: "Taproom",
  destState: "PA · where the beer is poured",
  destStateOptions: ["PA · where the beer is poured", "OH · where the beer is poured"],
  qty: 1,
  bbl: "0.50000000",
};

/** Reverse the standalone Warehouse · Cold +1 adjustment. */
export const reverseMovementAdjustment: ReverseMovementSnapshot = {
  qty: 1,
  type: "adjustment",
  location: "Warehouse",
  bin: "Cold",
  lot: "Untracked",
  bbl: 0.5,
  note: "Entered twice",
};

/** Recent movements, not the complete ledger behind the stock totals; neither standalone entry has a document reference. */
export const finishedGoodsMovements: FinishedGoodsMovements = {
  rows: [
    {
      key: "festival-removal",
      title: `-${recordMovementFestival.qty} ${SKU_HAZY.name}`,
      detail: `Festival removal · ${recordMovementFestival.location} · ${recordMovementFestival.bin} · ${recordMovementFestival.bbl} bbl · PA · ${recordMovementFestival.channel} · Community festival`,
      trailing: formatDateTime("2026-09-10T14:00:00Z", DEMO_TIME_ZONE),
      outbound: true,
    },
    {
      key: "standalone-adjustment",
      title: `+${reverseMovementAdjustment.qty} ${SKU_HAZY.name}`,
      detail: `Adjustment · ${reverseMovementAdjustment.location} · ${reverseMovementAdjustment.bin} · ${Number(reverseMovementAdjustment.bbl).toFixed(8)} bbl · ${reverseMovementAdjustment.note}`,
      trailing: formatDateTime("2026-09-10T13:00:00Z", DEMO_TIME_ZONE),
      outbound: false,
    },
  ],
};
