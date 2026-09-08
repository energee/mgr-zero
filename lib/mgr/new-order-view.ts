// lib/mgr/new-order-view.ts — view-model for the New order sheet.
export type NewOrderLineView = { name: string; qty: number; atp: number; warning: boolean };

export type NewOrderViewModel = {
  customers: string[];
  customer: string;
  shipTos: string[];
  shipTo: string;
  sources: string[];
  source: string;
  requestedShip: string;
  po: string;
  lines: NewOrderLineView[];
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
