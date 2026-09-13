// lib/mgr/new-order-view.ts — view-model for the New order sheet.
export type OrderOption = string | { id: string; label: string };
export type NewOrderLineView = { name: string; skuId?: string; qty: number | string; atp?: number; warning: boolean };

export type NewOrderViewModel = {
  customers: OrderOption[];
  customer: string;
  shipTos: OrderOption[];
  shipTo: string;
  sources: OrderOption[];
  source: string;
  requestedShip: string;
  po: string;
  lines: NewOrderLineView[];
  skus?: { id: string; label: string }[];
  kind?: "wholesale" | "taproom_transfer";
  destination?: string;
  backHref?: string;
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
