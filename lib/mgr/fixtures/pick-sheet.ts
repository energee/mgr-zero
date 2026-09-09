// lib/mgr/fixtures/pick-sheet.ts — daily_pick_sheet snapshot for the Pick
// sheet inventory frame. Views never own sample data.
import { ALS, RIDGELINE, SKU_HAZY, SKU_PILS, TERESA } from "./demo";
import type { PickSheetSnapshot } from "@/lib/mgr/pick-sheet-view";

export const PICK_SHEET_DATE_CHIPS = ["Wed 9/2", "Thu 9/3", "Fri 9/4"];

const ORDER_231 = "00000000-0000-4000-8000-000000000231";
const ORDER_232 = "00000000-0000-4000-8000-000000000232";
const ORDER_234 = "00000000-0000-4000-8000-000000000234";

const line = (
  id: string,
  sku: { sku_id: string; name: string },
  qty_ordered: number,
) => ({
  id,
  sku_id: sku.sku_id,
  qty_ordered,
  qty_picked: null,
  skus: { name: sku.name },
});

/** Confirmed demand for Thu 2026-09-03: three orders, Hazy 9 + Pils 22. */
export const pickSheet: PickSheetSnapshot = {
  orders: [
    {
      id: ORDER_231,
      order_no: 231,
      status: "confirmed",
      requested_ship_date: "2026-09-03",
      customers: { name: RIDGELINE.name },
      order_lines: [
        line("l-231-hazy", SKU_HAZY, 4),
        line("l-231-pils-a", SKU_PILS, 5),
        line("l-231-pils-b", SKU_PILS, 2),
      ],
    },
    {
      id: ORDER_232,
      order_no: 232,
      status: "confirmed",
      requested_ship_date: "2026-09-03",
      customers: { name: ALS.name },
      order_lines: [line("l-232-pils", SKU_PILS, 5)],
    },
    {
      id: ORDER_234,
      order_no: 234,
      status: "confirmed",
      requested_ship_date: "2026-09-03",
      customers: { name: TERESA.name },
      order_lines: [
        line("l-234-hazy-a", SKU_HAZY, 2),
        line("l-234-hazy-b", SKU_HAZY, 3),
        line("l-234-pils-a", SKU_PILS, 3),
        line("l-234-pils-b", SKU_PILS, 4),
        line("l-234-pils-c", SKU_PILS, 3),
      ],
    },
  ],
};
