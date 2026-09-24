// lib/mgr/return-credit-view.ts — view-model for Return and credit.
import { docNo } from "./doc-no";
import { money } from "./money";

export type ReturnCreditLineView = {
  key: string;
  name: string;
  detail: string;
  qty: number;
  shipped: number;
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
  creditInfo: string;
  tape: [string, string][];
  note: string;
};

export type ReturnCreditSnapshot = {
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
  { id: "damaged", label: "damaged · written to loss" },
  { id: "wrong_item", label: "wrong item · back to stock" },
  { id: "unsold", label: "unsold · back to stock" },
] as const;

/** Map get_order / get_invoice plus the return qty onto ReturnCreditView. Beer
 *  lines come back as stock (and, when damaged, go to loss); keg deposit lines
 *  refund whole kegs' deposits in the same credit memo and move no stock. */
export function toReturnCreditViewProps({
  order, invoice, lines, locations, reason = "damaged", backHref, returnLocationId }: ReturnCreditSnapshot): ReturnCreditViewModel {
  const destinationId = returnLocationId ?? order?.from_location_id ?? "";
  const from = locations.find((l) => l.id === destinationId);
  const returnToOptions = locations.map(l => ({ id: l.id, label: l.id === order?.from_location_id ? `${l.name} · original fulfillment source` : l.name }));
  const destName = from?.name ?? "—";
  const inv = docNo("INV", invoice.invoice_no, "Invoice");
  const creditCents = lines.reduce((n, l) => n + Math.round(Number(l.qty_returning) * Number(l.unit_price_cents)), 0);
  const tape: [string, string][] = [];
  for (const l of lines) {
    const qty = Number(l.qty_returning);
    if (qty <= 0) continue;
    const short = l.skus?.name ?? "Line";
    if (l.kind === "keg_deposit") {
      tape.push([`${qty} ${short} · deposit refund`, money(-Math.round(qty * Number(l.unit_price_cents)))]);
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
      step: l.kind === "keg_deposit" ? "1" : "0.01",
    })),
    reasons: RETURN_REASONS.map(entry => entry.label),
    returnTo: returnToOptions.find(option => option.id === destinationId)?.label ?? destName,
    returnToId: destinationId,
    returnToOptions,
    reason: RETURN_REASONS.findIndex(entry => entry.id === reason),
    creditInfo: `Credited at the price on ${inv}, not today’s price group.`,
    tape: reason ? tape : [],
    note: "Empty-keg asset returns are a different Keg fleet command.",
  };
}
