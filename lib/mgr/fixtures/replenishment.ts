import type { ReplenishmentViewModel } from "@/lib/mgr/replenishment-view";
import { toParsViewProps } from "@/lib/mgr/pars-view";
import { OUNCES_PER_BBL } from "@/lib/volume";

const pils = { skuId: "lantern-pils-case", sku: "Lantern Pils · 16 oz case" };
const shortfall = { skuId: pils.skuId, skuName: pils.sku, onHand: 22, allocated: 28, atp: -6 };
const detail = toParsViewProps({
  shortfall,
  unit: "case",
  bblPerUnit: (24 * 16) / OUNCES_PER_BBL,
  orderAllocations: [],
  standing: [],
  par: null,
});
detail.atpDetail += " across all locations";
detail.rows = [
  { key: "lantern-order", title: "Order 231 · Orchard Lantern", detail: "22 cases reserved", verb: "Review", tone: "primary" },
  { key: "lantern-standing", title: "Standing allocation · Lantern taproom", detail: "6 cases reserved", verb: "Review", tone: "primary" },
];

export const replenishmentDemo: ReplenishmentViewModel = {
  locationId: "lantern-taproom",
  locationName: "Lantern taproom",
  locations: [{ value: "lantern-taproom", label: "Lantern taproom" }],
  warehouses: [
    { id: "lantern-warehouse", name: "Lantern warehouse" },
    { id: "meadow-warehouse", name: "Meadow warehouse" },
  ],
  suggestions: [
    { ...pils, par: 8, onHand: 2, suggested: 6 },
    { skuId: "meadow-pale-keg", sku: "Meadow Pale · ½ bbl keg", par: 4, onHand: 1, suggested: 3 },
    { skuId: "nightfall-stout-sixth", sku: "Nightfall Stout · ⅙ bbl keg", par: 2, onHand: 3, suggested: 0 },
  ],
  allocations: [{ id: "lantern-standing", skuId: pils.skuId, sku: pils.sku, qty: 6 }],
  shortfalls: [{ skuId: pils.skuId, onHand: 22, allocated: 28, atp: -6, detail }],
  canEdit: true,
};
