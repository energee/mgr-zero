// lib/mgr/new-order-view.ts — view-model for the New order sheet.
import { isPastDay } from "@/lib/date-format";

export type OrderOption = string | { id: string; label: string };
export type NewOrderLineView = { name: string; skuId?: string; qty: number | string; atp?: number; warning: boolean; /** Retained selection absent from the current order's SKU options. */ skuError?: string };

export type NewOrderViewModel = {
  customers: OrderOption[];
  customer: string;
  shipTos: OrderOption[];
  shipTo: string;
  sources: OrderOption[];
  source: string;
  requestedShip: string;
  /** The brewery's day (breweryDate), so a past Requested ship warns; the inventory leaves it out. */
  today?: string;
  po: string;
  /** Collected at the brewery, so never put on a route. */
  pickup?: boolean;
  lines: NewOrderLineView[];
  skus?: { id: string; label: string }[];
  kind?: "wholesale" | "taproom_transfer";
  destination?: string;
  backHref?: string;
  /** Where customers are made, on a live page; the inventory leaves it inert. */
  customersHref?: string;
  catalogHref?: string;
};

export type NewOrderSnapshot = {
  customers: string[];
  customer: string;
  shipTos: string[];
  shipTo: string;
  sources: string[];
  source: string;
  requestedShip: string;
  po: string;
  lines: { name: string; qty: number; atp: number }[];
};

export function toNewOrderViewProps(s: NewOrderSnapshot): NewOrderViewModel {
  return {
    customers: s.customers,
    customer: s.customer,
    shipTos: s.shipTos,
    shipTo: s.shipTo,
    sources: s.sources,
    source: s.source,
    requestedShip: s.requestedShip,
    po: s.po,
    lines: s.lines.map((l) => ({ ...l, warning: l.atp < 0 })),
  };
}

/** A past Requested ship date still saves; the sheet says so rather than saving it silently (#1489). */
export function pastShipDateWarning(date: string, today?: string): string | undefined {
  return isPastDay(date, today) ? "This requested ship date is in the past for your brewery. You can still save the order." : undefined;
}
