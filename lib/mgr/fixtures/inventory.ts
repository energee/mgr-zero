// lib/mgr/fixtures/inventory.ts — get_on_hand / get_atp / record_movement
// snapshots for Finished goods, Record movement, and Movement recorded.
// Identities from demo.ts. Views own no sample data.
import { SKU_HAZY, SKU_PILS, SKU_STOUT, LOC_WAREHOUSE, LOC_TAPROOM } from "./demo";
import type { FinishedGoodsSnapshot } from "@/lib/mgr/finished-goods-view";
import type { RecordMovementSnapshot } from "@/lib/mgr/record-movement-view";
import type { MovementRecordedSnapshot } from "@/lib/mgr/movement-recorded-view";
import type { ReverseMovementSnapshot } from "@/lib/mgr/reverse-movement-view";

/** Beer → Finished goods: Hazy / Pils shortfall / Stout. */
export const finishedGoodsList: FinishedGoodsSnapshot = {
  skus: [
    { id: SKU_HAZY.sku_id, name: SKU_HAZY.name, on_hand: 15, atp: 11 },
    { id: SKU_PILS.sku_id, name: SKU_PILS.name, on_hand: 18, atp: -6 },
    { id: SKU_STOUT.sku_id, name: SKU_STOUT.name, on_hand: 9, atp: 7 },
  ],
};

/** Festival removal of one Hazy ½ bbl keg from Warehouse · Cold into PA. */
export const recordMovementFestival: RecordMovementSnapshot = {
  kind: "festival removal",
  sku: SKU_HAZY.name,
  location: LOC_WAREHOUSE.name,
  locationOptions: [LOC_WAREHOUSE.name, LOC_TAPROOM.name],
  bin: "Cold",
  binOptions: ["Cold", "Dry", "Walk-in"],
  channel: "Taproom",
  destState: "PA · where the beer is poured",
  destStateOptions: ["PA · where the beer is poured", "OH · where the beer is poured"],
  qty: 1,
  unit: "keg",
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

/** Post-commit echo of recordMovementFestival. */
export const movementRecordedFestival: MovementRecordedSnapshot = {
  sku: "Hazy IPA · ½ bbl",
  qty: -1,
  unit: "keg",
  kind: "festival removal",
  destState: "PA",
  bbl: "0.50000000",
  when: "just now",
};
