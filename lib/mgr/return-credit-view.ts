// lib/mgr/return-credit-view.ts — view-model for Return and credit.
import { docNo } from "./doc-no";
import { money } from "./money";

export type ReturnCreditLineView = {
  key: string;
  name: string;
  detail: string;
  qty: number;
};

export type ReturnCreditViewModel = {
  backTo: string;
  backHref?: string;
  title: string;
  lines: ReturnCreditLineView[];
  reasons: string[];
  returnTo: string;
  returnToOptions: string[];
  depositLabel?: string;
  depositAmount?: string;
  creditInfo: string;
  tape: [string, string][];
  note: string;
};

export type ReturnCreditSnapshot = {
  order: {
    id: string;
    order_no: number | null;
    from_location_id: string;
  };
  invoice: { invoice_no: number | null };
  lines: {
    id: string;
    qty_shipped: number | null;
    qty_returning: number;
    unit_price_cents: number;
    skus: { name: string } | null;
  }[];
  deposit?: { label: string; cents: number };
  locations: { id: string; name: string }[];
  reason?: "damaged" | "wrong_item" | "unsold";
  backHref?: string;
};

const REASONS = ["damaged", "wrong item", "unsold"];

function shortName(name: string) {
  if (/hazy/i.test(name)) return "Hazy ½ bbl";
  if (/pils/i.test(name)) return "Pils case";
  return name;
}

/** Map get_order / get_invoice plus the return qty onto ReturnCreditView. */
export function toReturnCreditViewProps({
  order, invoice, lines, deposit, locations, reason = "damaged", backHref,
}: ReturnCreditSnapshot): ReturnCreditViewModel {
  const from = locations.find((l) => l.id === order.from_location_id);
  const returnToOptions = locations.map((l) => (
    l.id === order.from_location_id ? `${l.name} · original fulfillment source` : l.name
  ));
  const destName = from?.name ?? "—";
  const inv = docNo("INV", invoice.invoice_no, "Invoice");
  const beerCents = lines.reduce((n, l) => n + Number(l.qty_returning) * Number(l.unit_price_cents), 0);
  const creditCents = beerCents + (deposit?.cents ?? 0);
  const tape: [string, string][] = [];
  for (const l of lines) {
    const qty = Number(l.qty_returning);
    if (qty <= 0) continue;
    const short = shortName(l.skus?.name ?? "line");
    tape.push([`+${qty} ${short} · return in`, destName]);
    if (reason === "damaged") tape.push([`−${qty} ${short} · loss · damaged`, "not sellable"]);
  }
  tape.push(["credit memo number · on commit", money(-creditCents)]);
  return {
    backTo: docNo("ORD", order.order_no, "Order"),
    backHref,
    title: "Beer return",
    lines: lines.map((l) => ({
      key: l.id,
      name: l.skus?.name ?? "Line",
      detail: `shipped ${Number(l.qty_shipped ?? 0)} · returning`,
      qty: Number(l.qty_returning),
    })),
    reasons: REASONS,
    returnTo: from ? `${from.name} · original fulfillment source` : destName,
    returnToOptions,
    depositLabel: deposit?.label,
    depositAmount: deposit ? money(-deposit.cents) : undefined,
    creditInfo: `Credited at the price on ${inv}, not today’s price group.`,
    tape,
    note: "Empty-keg asset returns are a different Keg fleet command.",
  };
}
