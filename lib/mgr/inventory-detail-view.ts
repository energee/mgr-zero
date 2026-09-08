export type InventoryMovement = {
  id: string; sku_id: string; location_id: string; bin_id: string; lot_id: string | null;
  qty: number; bbl: number; package_type: string; type: string; created_at: string; note: string | null;
  ref: string | null; source_movement_id: string | null; compensates_id: string | null; reversed_by: string | null;
  sale_channel_id: string | null; tax_treatment: string | null; dest_state: string | null;
  locations: { name: string } | null; bins: { name: string } | null; lots: { code: string } | null;
};
export function canReverseMovement(m: Pick<InventoryMovement, "type" | "ref" | "source_movement_id" | "compensates_id" | "reversed_by">) {
  return ["adjustment", "loss"].includes(m.type) && !m.ref && !m.source_movement_id && !m.compensates_id && !m.reversed_by;
}
export function toInventoryDetailViewProps(input: {
  sku: { id: string; name: string; active: boolean };
  onHand: { location_id: string; qty: number; locations: { name: string } | null }[];
  atp: { qty: number }[]; movements: InventoryMovement[]; backHref?: string;
}) {
  const onHand = input.onHand.reduce((total, row) => total + Number(row.qty), 0);
  const atp = input.atp[0] ? Number(input.atp[0].qty) : onHand;
  return { ...input, onHandTotal: onHand, available: atp, allocated: onHand - atp };
}
export type InventoryDetailViewModel = ReturnType<typeof toInventoryDetailViewProps>;
