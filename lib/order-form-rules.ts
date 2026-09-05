// lib/order-form-rules.ts — the pure "is this New Order form submittable" rule
// behind app/(app)/orders/order-form.tsx (audit 2026-09-05, rendered-ux-perf
// #3). Mirrors the create_order input schema in lib/commands/orders.ts and the
// orders check constraint: wholesale needs customer + ship-to, a taproom
// transfer needs a to-location, both need a from-location and at least one
// line with a SKU and a positive quantity. On an empty brewery it also yields
// the hint that tells staff what to create first, so the Create button is
// never the first place they learn the catalog is empty.

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

export function orderFormReadiness(i: OrderFormReadinessInput): OrderFormReadiness {
  const party = i.kind === "wholesale" ? Boolean(i.customerId && i.shipToId) : Boolean(i.toLocationId);
  const hasLine = i.lines.some((l) => l.skuId && Number(l.qty) > 0);
  const submittable = party && Boolean(i.fromLocationId) && hasLine;

  const missing: string[] = [];
  if (i.kind === "wholesale" && i.catalog.customers === 0) missing.push("a customer");
  if (i.catalog.locations === 0) missing.push("a location");
  if (i.catalog.skus === 0) missing.push("a SKU");
  const hint = missing.length === 0 ? null : `Before creating an order, add ${list(missing)}.`;

  return { submittable, hint };
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
