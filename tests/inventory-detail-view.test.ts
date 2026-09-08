import { expect, it } from "vitest";
import { canReverseMovement, toInventoryDetailViewProps } from "@/lib/mgr/inventory-detail-view";
import { INVENTORY_DETAIL } from "@/lib/mgr/fixtures/inventory-detail";

it("offers correction only for a structurally standalone unreversed adjustment or loss", () => {
  const original = INVENTORY_DETAIL.movements[0];
  expect(canReverseMovement(original)).toBe(true);
  expect(canReverseMovement({ ...original, type: "loss" })).toBe(true);
  for (const type of ["depletion", "sale_removal", "production_in", "return_in", "repack", "location_transfer"]) expect(canReverseMovement({ ...original, type })).toBe(false);
  for (const field of ["ref", "source_movement_id", "compensates_id", "reversed_by"]) expect(canReverseMovement({ ...original, [field]: "id" })).toBe(false);
});
it("keeps zero-stock historical SKUs and never invents a location or live fixture path", () => {
  const model = toInventoryDetailViewProps({ sku: { id: "s", name: "Archived keg", active: false }, onHand: [], atp: [], movements: [] });
  expect(model).toMatchObject({ onHandTotal: 0, available: 0, allocated: 0, onHand: [] });
  expect(model.backHref).toBeUndefined();
  expect(INVENTORY_DETAIL.backHref).toBeUndefined();
});
