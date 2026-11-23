// lib/mgr/fixtures/portal.ts — portal_catalog + get_portal_account snapshots
// for Shop and Review order. Identities come from demo.ts; prices are the
// inventory literals ($150.00, $38.00, $42.00, $18.00, $62.00). Cart: 4 Hazy
// kegs + 6 Pils cases = $828.00 merchandise; 4 × $30.00 = $120.00 deposit.
import { LOC_WAREHOUSE, SKU_HAZY, SKU_PILS, SKU_STOUT } from "./demo";
import type { ShopRelease, ShopSnapshot } from "@/lib/mgr/shop-view";
import type { ReviewOrderSnapshot } from "@/lib/mgr/review-order-view";

const SHIP_MAIN = "00000000-0000-4000-8000-0000000000d1";
const SHIP_DOCK = "00000000-0000-4000-8000-0000000000d2";
const SKU_HAZY_CASE = "00000000-0000-4000-8000-0000000000a4";
const SKU_PILS_BOTTLE = "00000000-0000-4000-8000-0000000000a5";
const SKU_FEST = "00000000-0000-4000-8000-0000000000a6";

type Pack = Pick<ShopSnapshot["catalog"][number], "packageType" | "kegSize" | "unitsPerCase" | "palletFit" | "palletFitMixed">;
// Package facts and pallet fits: 8 half kegs or 20 sixtels to a pallet, 10 cases to a layer.
const HALF: Pack = { packageType: "keg", kegSize: "half_bbl", unitsPerCase: null, palletFit: 8, palletFitMixed: 6 };
const SIXTEL: Pack = { packageType: "keg", kegSize: "sixth_bbl", unitsPerCase: null, palletFit: 20 };
const CASE: Pack = { packageType: "can", kegSize: null, unitsPerCase: 24, palletFit: 10 };
const BOTTLE: Pack = { packageType: "bottle", kegSize: null, unitsPerCase: null, palletFit: null };

const item = (
  skuId: string,
  name: string,
  product: string,
  unitPriceCents: number,
  qty: number,
  pack: Pack,
  releases: ShopRelease[] = [],
  brandAlias: string | null = null,
): ShopSnapshot["catalog"][number] => ({
  // portal_catalog names the format apart from the SKU; these SKU names are the format names.
  skuId, name, product, brandAlias, formatName: name, unitPriceCents, badge: "in", releases, qty, ...pack,
});

/** Ridgeline Shop cart: 4 Hazy ½ bbl + 6 Pils cases, Main · 2026-09-09. */
export const ridgelineShop: ShopSnapshot = {
  shipTos: [
    { id: SHIP_MAIN, label: "Main", country: "US", address1: "", city: "Phoenixville", state: "PA", zip: "" },
    { id: SHIP_DOCK, label: "Dock", country: "US", address1: "", city: "Royersford", state: "PA", zip: "" },
  ],
  shipToId: SHIP_MAIN,
  requestedDate: "2026-09-09",
  source: { name: LOC_WAREHOUSE.name },
  catalog: [
    item(SKU_HAZY.sku_id, "½ bbl keg", "Hazy IPA", SKU_HAZY.unit_price_cents, 4, HALF),
    item(SKU_HAZY_CASE, "case · 24×16 oz", "Hazy IPA", 4200, 0, CASE),
    item(SKU_PILS.sku_id, "case · 24×16 oz", "Pils", SKU_PILS.unit_price_cents, 6, CASE),
    item(SKU_PILS_BOTTLE, "12 oz bottle", "Pils", 1800, 0, BOTTLE),
    // Stout is in stock and also released from a planned batch: the row offers both. Its brand has an alias, shown under the brand.
    item(SKU_STOUT.sku_id, "⅙ bbl keg", "Stout", 6200, 0, SIXTEL, [{ releaseId: "00000000-0000-4000-8000-0000000000e1", shipsFrom: "2026-10-02", ordersCloseOn: "2026-09-25", badge: "in" }], "Night Series #4"),
    // Festbier is not packaged yet: staff released it from its planned batch, so it is only under Pre-order.
    { ...item(SKU_FEST, "⅙ bbl keg", "Festbier", 6800, 0, SIXTEL, [{ releaseId: "00000000-0000-4000-8000-0000000000e2", shipsFrom: "2026-10-09", ordersCloseOn: "2026-10-02", badge: "low", fromBatch: true, bblPerUnit: 0.1667, limitLeftBbl: 2.3, limitLiftsOn: "2026-09-25" }]), badge: null },
  ],
  // The buyer's limit on each batch, part of it earned by buying from stock, and their usual Festbier order.
  share: { pct: 18, basePct: 15, manual: false, liftDays: 14 },
  suggested: [{ releaseId: "00000000-0000-4000-8000-0000000000e2", skuId: SKU_FEST, qty: 4, lastOn: "2026-09-02" }],
  // Planned batches: Festbier is open for pre-order above; Pils is planned but not released; Saison is not on this buyer's list.
  planned: [
    { brand_name: "Festbier", planned_week: "2026-09-28", listed: true },
    { brand_name: "Pils", planned_week: "2026-09-21", listed: true },
    { brand_name: "Saison", planned_week: "2026-10-05", listed: false },
  ],
  depositCentsPerKeg: 3000,
};

export const ridgelineReviewOrder: ReviewOrderSnapshot = {
  ...ridgelineShop,
  quote: {
    quoteId: "fixture-quote", taxStatus: "pending", subtotalCents: 82800,
    depositCents: 12000, amountBeforeTaxCents: 94800,
    source: { id: LOC_WAREHOUSE.id, name: LOC_WAREHOUSE.name },
    destination: { id: SHIP_MAIN, label: "Main", address1: "", city: "Phoenixville", state: "PA", zip: "" },
    lines: ridgelineShop.catalog.filter(item => item.qty > 0).map(item => ({ ...item, amountCents: item.qty * item.unitPriceCents })),
    deposits: [{ name: "Hazy IPA", kegSize: "half_bbl", qty: 4, unitPriceCents: 3000, amountCents: 12000 }],
  },
};
