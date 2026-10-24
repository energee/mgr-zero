// lib/order-form-rules.ts — the pure "is this New order form submittable" rule
// behind app/(app)/orders/order-form.tsx. Mirrors the create_order input schema
// in lib/commands/orders.ts and the orders check constraint; on an empty
// brewery it also yields the hint naming what to create first, and a "Go to"
// sentence linking the pages where Sales can add it.
import { andList, submitReason } from "@/lib/mgr/submit-reason";

export type OrderFormReadinessInput = {
  kind: "wholesale" | "taproom_transfer";
  customerId: string;
  shipToId: string;
  fromLocationId: string;
  toLocationId: string;
  lines: { skuId: string; qty: string }[];
  /** When supplied, selected SKUs must belong to the current picker options. */
  availableSkuIds?: string[];
  /** Option counts of the selects the form renders. */
  catalog: { customers: number; locations: number; skus: number };
};

export type OrderFormReadiness = {
  submittable: boolean;
  /** What Save draft still needs (submitReason), or null when submittable. */
  reason: string | null;
  /** Set only when a select the current kind needs has no options at all. */
  hint: string | null;
  /**
   * "Go to Customers or Catalog." as text pieces and page links, in reading
   * order; empty when nothing missing has a page Sales can add it on.
   */
  goTo: (string | { label: string; href: string })[];
};

/** Only a wholly empty spare row may be omitted from the order. */
export const isBlankLine = (l: { skuId: string; qty: string }) => !l.skuId && !l.qty.trim();

/** Every entered row needs a SKU and a finite, positive quantity. */
export const isCompleteLine = (l: { skuId: string; qty: string }) => Boolean(l.skuId) && Number.isFinite(Number(l.qty)) && Number(l.qty) > 0;

/** A line's corrections, one per field that is wrong, so each marks its own
 *  control. `sku` and `qty` are its SKU picker's and quantity's messages. */
export type LineErrors = { sku?: string; qty?: string };

/** One row's corrections; empty when the row is blank or complete. `count` is
 *  how many rows the form has: with more than one, removing the row is an option. */
export function orderLineError(line: { skuId: string; qty: string }, index: number, count: number): LineErrors {
  if (isBlankLine(line)) return {};
  const remove = count > 1 ? ", or remove the line" : "";
  const qty = Number(line.qty);
  return {
    ...(line.skuId ? {} : { sku: `Line ${index + 1}: select a SKU${remove}.` }),
    ...(Number.isFinite(qty) && qty > 0 ? {} : { qty: `Line ${index + 1}: enter a quantity greater than zero${remove}.` }),
  };
}

/** Every row's corrections as one list, for readiness checks; shared by order and transfer rows. */
export function orderLineErrors(lines: { skuId: string; qty: string }[]): string[] {
  return lines.flatMap((line, index) => Object.values(orderLineError(line, index, lines.length)));
}

/** Edit draft's corrections per line: a saved draft's SKU must still be
 *  offered and appear once, and its quantity must be at least 0.01 (a cent
 *  of a unit, the column's scale). */
export function draftLineErrors(lines: { skuId: string; qty: string }[], skuIds: string[]): LineErrors[] {
  return lines.map((line, index) => {
    const n = index + 1;
    const qty = Number(line.qty);
    let sku: string | undefined;
    if (!skuIds.includes(line.skuId)) sku = `Line ${n}: choose an available SKU.`;
    else if (lines.findIndex((other) => other.skuId === line.skuId) !== index) sku = `Line ${n}: this SKU is already on another line. Combine its quantities or remove this line.`;
    return {
      ...(sku ? { sku } : {}),
      ...(Number.isFinite(qty) && qty >= 0.01 ? {} : { qty: `Line ${n}: enter a quantity of at least 0.01.` }),
    };
  });
}

/** A retained nonblank selection is unavailable when the current options omit it. */
export function isUnavailableSku(skuId: string, availableSkuIds: string[]): boolean {
  return Boolean(skuId) && !availableSkuIds.includes(skuId);
}

export function orderFormReadiness(i: OrderFormReadinessInput): OrderFormReadiness {
  const needs: string[] = [];
  if (i.kind === "wholesale") {
    if (!i.customerId) needs.push("a customer");
    else if (!i.shipToId) needs.push("a ship-to");
  } else if (!i.toLocationId) needs.push("a destination location");
  if (!i.fromLocationId) needs.push("a source location");
  if (!i.lines.some(isCompleteLine) || orderLineErrors(i.lines).length > 0) needs.push("a SKU with a quantity above zero on each line");
  const availableSkuIds = i.availableSkuIds;
  if (availableSkuIds !== undefined && i.lines.some(line => isUnavailableSku(line.skuId, availableSkuIds))) needs.push("an available SKU on each line");

  // A transfer names no customer, so it never asks for one or links Customers.
  // Only an admin can add a location (/locations offers Sales no Add), so a
  // missing location is named but not linked.
  const missing: { thing: string; link?: { label: string; href: string } }[] = [];
  if (i.kind === "wholesale" && i.catalog.customers === 0) missing.push({ thing: "a customer", link: { label: "Customers", href: "/customers" } });
  if (i.catalog.locations === 0) missing.push({ thing: "a location" });
  if (i.catalog.skus === 0) missing.push({ thing: "a SKU", link: { label: "Catalog", href: "/catalog" } });
  const hint = missing.length === 0 ? null : `Before creating an order, add ${andList(missing.map(m => m.thing))}.`;

  // At most two links (Customers, Catalog), so " or " between them reads as a list.
  const links = missing.flatMap(m => m.link ? [m.link] : []);
  const goTo = links.length === 0 ? [] : ["Go to ", ...links.flatMap((link, k) => k === 0 ? [link] : [" or ", link]), "."];

  return { submittable: needs.length === 0, reason: submitReason(needs), hint, goTo };
}

/** Initial destination only; a caller's explicit draft selection stays authoritative. */
export function defaultShipToId(shipTos: { id: string; is_default?: boolean }[]): string {
  return shipTos.find((s) => s.is_default)?.id ?? shipTos[0]?.id ?? "";
}

/** The sale channel a wholesale order's SKU picker narrows to; a transfer, or no customer yet, offers every active SKU. */
export function skuPickerChannel(kind: "wholesale" | "taproom_transfer", customer: { sale_channel_id: string } | undefined): string | undefined {
  return kind === "wholesale" ? customer?.sale_channel_id : undefined;
}

/** A list_skus row as a picker option: "Brand — SKU". */
export function toSkuOption(sku: { id: string; name: string; brands: { name: string } | null }) {
  return { id: sku.id, label: sku.brands ? `${sku.brands.name} — ${sku.name}` : sku.name };
}
