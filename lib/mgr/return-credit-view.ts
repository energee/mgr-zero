// lib/mgr/return-credit-view.ts — view-model for Return and credit, and what
// Return shipment still needs (#1485).
import { docNo } from "./doc-no";
import { money } from "./money";
import { orderLineCents } from "./order-view";
import { isNumber, numberNotationError } from "./quantity-input";
import { submitReason } from "./submit-reason";

export type ReturnCreditLineView = {
  key: string;
  name: string;
  detail: string;
  qty: number;
  shipped: number;
  maxReturning: number;
  /** Quantity step: 0.01 for beer, 1 for a keg deposit (whole kegs). */
  step: string;
};

export type ReturnCreditViewModel = {
  backTo: string;
  backHref?: string;
  title: string;
  lines: ReturnCreditLineView[];
  reasons: string[];
  returnTo: string;
  returnToId: string;
  returnToOptions: { id: string; label: string }[];
  reason: number;
  returningBeer: boolean;
  creditInfo: string;
  tape: [string, string][];
  note: string;
};

export type ReturnCreditSnapshot = {
  refusedDeliveryId?: string;
  backHref?: string;
  order?: {
    id: string;
    order_no: number | null;
    from_location_id: string;
  };
  returnLocationId?: string;
  invoice: { invoice_no: number | null };
  lines: {
    id: string;
    qty_shipped: number | null;
    qty_returning: number;
    qty_returnable?: number;
    unit_price_cents: number;
    skus: { name: string } | null;
    /** A keg_deposit invoice line refunds its deposit (whole kegs, no
     *  inventory); omitted or "sku" is a beer line that comes back as stock. */
    kind?: "sku" | "keg_deposit";
  }[];
  locations: { id: string; name: string }[];
  reason?: "damaged" | "wrong_item" | "unsold" | "";
};

/** The command value and the chip label for each return reason, in chip order.
 *  The label carries the consequence because the reason decides whether the
 *  returned beer restocks or is written to loss in the same call. One table, so
 *  the chip index stays an implementation detail here instead of a contract
 *  spelled out again in every caller. */
export const RETURN_REASONS = [
  { id: "damaged", label: "Damaged · written to loss" },
  { id: "wrong_item", label: "Wrong item · back to stock" },
  { id: "unsold", label: "Unsold · back to stock" },
] as const;

/** What is wrong with a typed return quantity, shown under it: a negative or
 *  non-number, more than the line can return, or finer than its step (whole
 *  kegs for a deposit, cents of a unit for beer). Blank or zero is not an
 *  error: that line is not returned. return_shipment checks the same again. */
export function returnQuantityError(qty: string, line: Pick<ReturnCreditLineView, "maxReturning" | "step">): string | undefined {
  if (qty.trim() === "") return undefined;
  const notation = numberNotationError(qty);
  if (notation) return notation;
  const n = Number(qty);
  const whole = line.step === "1";
  const fine = whole ? Number.isInteger(n) : (qty.trim().split(".")[1]?.length ?? 0) <= 2;
  if (isNumber(qty) && n >= 0 && n <= line.maxReturning && fine) return undefined;
  return whole ? `Enter a whole number of kegs from 0 to ${line.maxReturning}.` : `Enter a quantity from 0 to ${line.maxReturning}, with at most two decimal places.`;
}

/** Only beer needs a disposition; empty-keg check-in needs a destination but
 * a refund on its own asks for neither. */
export function returnCreditReason({ lines, quantities, reason, locationId, binMissing, returnEmptyKegs = false }: {
  lines: ReturnCreditLineView[]; quantities: Record<string, string>; reason: string; locationId: string; binMissing: boolean; returnEmptyKegs?: boolean;
}): string | null {
  const missing = lines.filter(line => returnQuantityError(quantities[line.key] ?? "", line)).map(line => `a valid quantity for ${line.name}`);
  if (!missing.length && !lines.some(line => Number(quantities[line.key]) > 0)) missing.push("a quantity to return");
  const returningBeer = lines.some(line => line.step !== "1" && Number(quantities[line.key]) > 0);
  if (returningBeer && !reason) missing.push("a reason");
  if ((returningBeer || returnEmptyKegs) && !locationId) missing.push("a return location");
  if ((returningBeer || returnEmptyKegs) && binMissing) missing.push("a return bin");
  return submitReason(missing);
}

/** Map get_order / get_invoice plus the return qty onto ReturnCreditView. Beer
 *  lines come back as stock (and, when damaged, go to loss); keg deposit lines
 *  refund whole kegs' deposits in the same credit memo and move no stock. */
export function toReturnCreditViewProps({
  order, invoice, lines, locations, reason = "damaged", backHref, returnLocationId, refusedDeliveryId }: ReturnCreditSnapshot): ReturnCreditViewModel {
  const destinationId = returnLocationId ?? order?.from_location_id ?? "";
  const from = locations.find((l) => l.id === destinationId);
  const returnToOptions = locations.map(l => ({ id: l.id, label: l.id === order?.from_location_id ? `${l.name} · original fulfillment source` : l.name }));
  const destName = from?.name ?? "—";
  const inv = docNo("INV", invoice.invoice_no, "Invoice");
  const creditCents = lines.reduce((n, l) => n + orderLineCents(Number(l.qty_returning), Number(l.unit_price_cents)), 0);
  const returningBeer = lines.some(line => line.kind !== "keg_deposit" && Number(line.qty_returning) > 0);
  const tape: [string, string][] = [];
  for (const l of lines) {
    const qty = Number(l.qty_returning);
    if (qty <= 0) continue;
    const short = l.skus?.name ?? "Line";
    if (l.kind === "keg_deposit") {
      tape.push([`${qty} ${short} · deposit refund`, money(-orderLineCents(qty, Number(l.unit_price_cents)))]);
      continue;
    }
    tape.push([`+${qty} ${short} · return in`, destName]);
    if (reason === "damaged") tape.push([`−${qty} ${short} · loss · damaged`, "not sellable"]);
  }
  tape.push(["credit memo number · on commit", money(-creditCents)]);
  return {
    backTo: order ? docNo("ORD", order.order_no, "Order") : inv,
    backHref,
    title: "Beer return",
    lines: lines.map((l) => ({
      key: l.id,
      name: l.skus?.name ?? "Line",
      detail: l.kind === "keg_deposit" ? `deposit on ${Number(l.qty_shipped ?? 0)} kegs · refunding` : `shipped ${Number(l.qty_shipped ?? 0)} · returning`,
      qty: Number(l.qty_returning),
      shipped: Number(l.qty_shipped ?? 0),
      maxReturning: Number(l.qty_returnable ?? l.qty_shipped ?? 0),
      step: l.kind === "keg_deposit" ? "1" : "0.01",
    })),
    reasons: RETURN_REASONS.map(entry => entry.label),
    returnTo: returnToOptions.find(option => option.id === destinationId)?.label ?? destName,
    returnToId: destinationId,
    returnToOptions,
    reason: RETURN_REASONS.findIndex(entry => entry.id === reason),
    returningBeer,
    creditInfo: `Credited at the price on ${inv}, not today’s price group.`,
    tape: returningBeer && !reason ? [] : tape,
    note: refusedDeliveryId ? "Check in only refused beer here. Return accepted beer separately from the invoice." : "Full kegs return their shells automatically. For a deposit-only refund, check in empty kegs here only if they are arriving now.",
  };
}
