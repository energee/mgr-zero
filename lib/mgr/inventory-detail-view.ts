export type InventoryMovement = {
  id: string; sku_id: string; location_id: string; bin_id: string; lot_id: string | null;
  qty: number; bbl: number; package_type: string; type: string; created_at: string; note: string | null;
  ref: string | null; source_movement_id: string | null; compensates_id: string | null; reversed_by: string | null;
  ref_label?: string | null;
  /** Which table `ref` names (movementReferences); null when no visible document resolved. */
  ref_kind?: string | null;
  sale_channel_id: string | null; tax_treatment: string | null; dest_state: string | null;
  locations: { name: string } | null; bins: { name: string } | null; lots: { code: string } | null;
};
export function canReverseMovement(m: Pick<InventoryMovement, "type" | "ref" | "source_movement_id" | "compensates_id" | "reversed_by">) {
  return ["adjustment", "loss"].includes(m.type) && !m.ref && !m.source_movement_id && !m.compensates_id && !m.reversed_by;
}
/** The staff page of the document a movement came from, by list_movements'
 *  ref_kind. A weekly count has no page of its own, so it links nowhere. */
const SOURCE_PATHS: Record<string, string> = {
  order: "/orders/", run: "/packaging/", transfer: "/transfers/", invoice: "/invoices/", delivery: "/work/deliveries/",
};
export function movementSourceHref(m: Pick<InventoryMovement, "ref" | "ref_kind">): string | undefined {
  const path = m.ref && m.ref_kind ? SOURCE_PATHS[m.ref_kind] : undefined;
  return path && path + m.ref;
}
export function toInventoryDetailViewProps(input: {
  sku: { id: string; name: string; active: boolean };
  onHand: { location_id: string; qty: number; locations: { name: string } | null }[];
  atp: { qty: number }[]; movements: InventoryMovement[]; backHref?: string;
  /** breweries.timezone: movement times print in it (#442). */
  timeZone: string;
}) {
  const onHand = input.onHand.reduce((total, row) => total + Number(row.qty), 0);
  const atp = input.atp[0] ? Number(input.atp[0].qty) : onHand;
  return { ...input, onHandTotal: onHand, available: atp, allocated: onHand - atp };
}
export type InventoryDetailViewModel = ReturnType<typeof toInventoryDetailViewProps>;
