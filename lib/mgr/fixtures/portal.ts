// lib/mgr/fixtures/portal.ts — portal_catalog + get_portal_account snapshots
// for Shop and Review order. Identities come from demo.ts; prices are the
// inventory literals ($150.00, $38.00, $42.00, $18.00, $62.00). Cart: 4 Hazy
// kegs + 6 Pils cases = $828.00 merchandise; 4 × $30.00 = $120.00 deposit.
import { LOC_WAREHOUSE, RIDGELINE, SKU_HAZY, SKU_PILS, SKU_STOUT } from "./demo";
import type { ShopSnapshot } from "@/lib/mgr/shop-view";

const CUSTOMER_RIDGELINE = "00000000-0000-4000-8000-0000000000c1";
const SHIP_MAIN = "00000000-0000-4000-8000-0000000000d1";
const SHIP_DOCK = "00000000-0000-4000-8000-0000000000d2";
const SKU_HAZY_CASE = "00000000-0000-4000-8000-0000000000a4";
const SKU_PILS_BOTTLE = "00000000-0000-4000-8000-0000000000a5";

const item = (
  skuId: string,
  name: string,
  product: string,
  unitPriceCents: number,
  qty: number,
): ShopSnapshot["catalog"][number] => ({
  skuId, name, product, unitPriceCents, badge: "in", qty,
});

/** Ridgeline Shop cart: 4 Hazy ½ bbl + 6 Pils cases, Main · 2026-09-09. */
export const ridgelineShop: ShopSnapshot = {
  customer: { id: CUSTOMER_RIDGELINE, name: RIDGELINE.name },
  shipTos: [
    { id: SHIP_MAIN, label: "Main", address1: "", city: "Phoenixville", state: "PA", zip: "" },
    { id: SHIP_DOCK, label: "Dock", address1: "", city: "Royersford", state: "PA", zip: "" },
  ],
  shipToId: SHIP_MAIN,
  requestedDate: "2026-09-09",
  source: { name: LOC_WAREHOUSE.name },
  catalog: [
    item(SKU_HAZY.sku_id, "½ bbl keg", "Hazy IPA", SKU_HAZY.unit_price_cents, 4),
    item(SKU_HAZY_CASE, "case · 24×16 oz", "Hazy IPA", 4200, 0),
    item(SKU_PILS.sku_id, "case · 24×16 oz", "Pils", SKU_PILS.unit_price_cents, 6),
    item(SKU_PILS_BOTTLE, "12 oz bottle", "Pils", 1800, 0),
    item(SKU_STOUT.sku_id, "⅙ bbl keg", "Stout", 6200, 0),
  ],
  depositCentsPerKeg: 3000,
};

export const ridgelineReviewOrder = ridgelineShop;
