import { expect, it } from "vitest";
import { canReverseMovement, toInventoryDetailViewProps } from "@/lib/mgr/inventory-detail-view";
import { INVENTORY_DETAIL } from "@/lib/mgr/fixtures/inventory-detail";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InventoryDetailView } from "@/components/mgr/views/inventory-detail";

it("offers correction only for a structurally standalone unreversed adjustment or loss", () => {
  const original = INVENTORY_DETAIL.movements[0];
  expect(canReverseMovement(original)).toBe(true);
  expect(canReverseMovement({ ...original, type: "loss" })).toBe(true);
  for (const type of ["depletion", "sale_removal", "production_in", "return_in", "repack", "location_transfer"]) expect(canReverseMovement({ ...original, type })).toBe(false);
  for (const field of ["ref", "source_movement_id", "compensates_id", "reversed_by"]) expect(canReverseMovement({ ...original, [field]: "id" })).toBe(false);
});
it("keeps zero-stock historical SKUs and never invents a location or live fixture path", () => {
  const model = toInventoryDetailViewProps({ sku: { id: "s", name: "Archived keg", active: false }, onHand: [], atp: [], movements: [], timeZone: "America/New_York" });
  expect(model).toMatchObject({ onHandTotal: 0, available: 0, allocated: 0, onHand: [] });
  expect(model.backHref).toBeUndefined();
  expect(INVENTORY_DETAIL.backHref).toBeUndefined();
});

it("shows source labels and lot codes rather than ledger identities (#1382)", () => {
  const id = "53e1d7c9-e862-4de1-908c-5f1134c729ab";
  const model = { ...INVENTORY_DETAIL, movements: [{ ...INVENTORY_DETAIL.movements[0], id, lot_id: id, lots: { code: "QA-TEST-LOT" }, ref: id, ref_label: "RUN-0001", source_movement_id: id }] };
  const html = renderToStaticMarkup(createElement(InventoryDetailView, { model }));
  const text = html.replace(/<[^>]*>/g, "");
  expect(text).toContain("QA-TEST-LOT");
  expect(text).toContain("RUN-0001");
  expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27,}/i);
  const unresolved = renderToStaticMarkup(createElement(InventoryDetailView, { model: { ...model, movements: [{ ...model.movements[0], ref_label: null, lots: null }] } })).replace(/<[^>]*>/g, "");
  expect(unresolved).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27,}/i);
});
