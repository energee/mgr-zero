import { toInventoryDetailViewProps } from "@/lib/mgr/inventory-detail-view";

export const INVENTORY_DETAIL = toInventoryDetailViewProps({
  sku: { id: "sku", name: "Hazy IPA · ½ bbl keg", active: true },
  onHand: [{ location_id: "warehouse", qty: 12, locations: { name: "Warehouse" } }, { location_id: "taproom", qty: 3, locations: { name: "Taproom" } }],
  atp: [{ qty: 11 }],
  movements: [{ id: "adjustment", sku_id: "sku", location_id: "warehouse", bin_id: "cold", lot_id: null,
    qty: 1, bbl: 0.5, package_type: "keg", type: "adjustment", created_at: "2026-09-08T12:00:00Z", note: "Verified count difference",
    ref: null, source_movement_id: null, compensates_id: null, reversed_by: null, sale_channel_id: null, tax_treatment: null, dest_state: null,
    locations: { name: "Warehouse" }, bins: { name: "Cold" }, lots: null }],
});
