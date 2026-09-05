// lib/order-form-rules.ts — the pure "is this New Order form submittable" rule
// behind app/(app)/orders/order-form.tsx. Mirrors the create_order input schema
// in lib/commands/orders.ts and the orders check constraint; on an empty
// brewery it also yields the hint naming what to create first.

export type OrderFormReadinessInput = {
  kind: "wholesale" | "taproom_transfer";
  customerId: string;
  shipToId: string;
  fromLocationId: string;
  toLocationId: string;
  lines: { skuId: string; qty: string }[];
  /** Option counts of the selects the form renders. */
  catalog: { customers: number; locations: number; skus: number };
};

export type OrderFormReadiness = {
  submittable: boolean;
  /** Set only when a select the current kind needs has no options at all. */
  hint: string | null;
};

/** A line the form both counts toward readiness and sends to create_order. */
export const isCompleteLine = (l: { skuId: string; qty: string }) => Boolean(l.skuId) && Number(l.qty) > 0;

const conjunction = new Intl.ListFormat("en", { type: "conjunction" });

export function orderFormReadiness(i: OrderFormReadinessInput): OrderFormReadiness {
  const party = i.kind === "wholesale" ? Boolean(i.customerId && i.shipToId) : Boolean(i.toLocationId);
  const hasLine = i.lines.some(isCompleteLine);
  const submittable = party && Boolean(i.fromLocationId) && hasLine;

  const missing: string[] = [];
  if (i.kind === "wholesale" && i.catalog.customers === 0) missing.push("a customer");
  if (i.catalog.locations === 0) missing.push("a location");
  if (i.catalog.skus === 0) missing.push("a SKU");
  const hint = missing.length === 0 ? null : `Before creating an order, add ${conjunction.format(missing)}.`;

  return { submittable, hint };
}
