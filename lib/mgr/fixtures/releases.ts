// lib/mgr/fixtures/releases.ts — list_release_batches and list_releases
// snapshots for the portal release screens (Planning's planned batches,
// Release for ordering, the Brand page's release rows under Sells as).
// Fictional beers only; ids are v4-shaped.
import type { ReleaseBatchRow, ReleaseRow } from "@/lib/mgr/release-view";
import { SKU_HAZY } from "./demo";

const BATCH_HAZY = "00000000-0000-4000-8000-0000000000f1";
const BATCH_PILS = "00000000-0000-4000-8000-0000000000f2";

/** Two planned batches: Hazy IPA projects a keg and a case, Pils one case. */
export const releaseBatches: ReleaseBatchRow[] = [
  { batch_id: BATCH_HAZY, batch_no: 41, sku_id: SKU_HAZY.sku_id, units: 12, needed_by: "2026-10-02", skus: { name: SKU_HAZY.name, brands: { name: "Hazy IPA" } } },
  { batch_id: BATCH_HAZY, batch_no: 41, sku_id: "00000000-0000-4000-8000-0000000000a4", units: 90, needed_by: "2026-10-02", skus: { name: "Hazy IPA · case · 24×16 oz", brands: { name: "Hazy IPA" } } },
  { batch_id: BATCH_PILS, batch_no: 42, sku_id: "00000000-0000-4000-8000-0000000000a5", units: 120, needed_by: "2026-10-09", skus: { name: "Pils · 12 oz bottle", brands: { name: "Pils" } } },
];

/** An open release of the Hazy batch's keg: 4 confirmed, 2 pre-ordered of 12. */
export const releaseHazyKeg: ReleaseRow = {
  id: "00000000-0000-4000-8000-0000000000e2", batch_id: BATCH_HAZY, batch_no: 41, sku_id: SKU_HAZY.sku_id, sku_name: SKU_HAZY.name,
  qty: 12, ships_from: "2026-10-02", orders_close_on: "2026-09-25", withdrawn_at: null, ready_on: "2026-10-02",
  open: true, cancelled: false, confirmed: 4, preordered: 2, remaining: 6,
};
