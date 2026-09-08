// lib/mgr/fixtures/pars.ts — get_shortfalls + list_standing_allocations
// snapshot for the Pars and allocation inventory frame. Views own no sample data.
import { OUNCES_PER_BBL } from "@/lib/volume";
import { LOC_TAPROOM, RIDGELINE, SKU_PILS, TERESA } from "./demo";
import type { ParsSnapshot } from "@/lib/mgr/pars-view";

const ORDER_231 = "00000000-0000-4000-8000-000000000231";
const ORDER_234 = "00000000-0000-4000-8000-000000000234";

/** 24 × 16 oz cans. Inventory prints the two-decimal bbl of that format. */
const CASE_BBL = (24 * 16) / OUNCES_PER_BBL;

/** Pils 16 oz case, ATP −6: Ridgeline adjust, Teresa’s release, taproom standing + par. */
export const parsPils: ParsSnapshot = {
  shortfall: {
    skuId: SKU_PILS.sku_id,
    skuName: SKU_PILS.name,
    atp: -6,
    onHand: 22,
    allocated: 28,
  },
  bblPerUnit: CASE_BBL,
  unit: "case",
  orderAllocations: [
    {
      id: "a-231",
      qty: 10,
      order_id: ORDER_231,
      order_no: 231,
      customers: { name: RIDGELINE.name },
      write: "adjust_order_lines",
    },
    {
      id: "a-234",
      qty: 12,
      order_id: ORDER_234,
      order_no: 234,
      customers: { name: TERESA.name },
      write: "release_allocation",
    },
  ],
  standing: [
    {
      id: "a-standing",
      sku_id: SKU_PILS.sku_id,
      qty: 6,
      ref: LOC_TAPROOM.id,
      skus: { name: SKU_PILS.name },
      locations: { name: LOC_TAPROOM.name },
    },
  ],
  par: {
    location_id: LOC_TAPROOM.id,
    location_name: LOC_TAPROOM.name,
    par_qty: 8,
  },
};
