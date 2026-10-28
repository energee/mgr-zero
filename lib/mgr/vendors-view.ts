// lib/mgr/vendors-view.ts — view-model for the Vendors list.
import type { EmptyState } from "./empty-state";
import { PO_SENT_VIA } from "./purchase-orders-view";
export type VendorsRowView = {
  key: string;
  title: string;
  detail: string;
  verb: string;
  disabled?: boolean;
};

export type VendorsViewModel = {
  backHref?: string;
  rows: VendorsRowView[];
  materials: string;
  contracts: string;
  empty?: EmptyState;
};

export type VendorsSnapshot = {
  backHref?: string;
  rows?: VendorsRowView[];
  materials?: string;
  contracts?: string;
  /** A search is on, so an empty list means no match, not no vendors. */
  filtered?: boolean;
};

/** The Vendors list's number format: thousands separated, at most two decimals. */
export const fmtVendorQty = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

type VendorLeadFacts = {
  lead_time_days: number | null;
  observed: { sent_via: string; n: number; avg_lead_days: number }[];
  contracts: unknown[];
};

/** A vendor row's detail: the typed lead time, each observed average with how
 *  many orders it rests on and how they were sent, then the contract count (#1501). */
export function vendorLeadLine(v: VendorLeadFacts): string {
  const typed = v.lead_time_days === null ? "no lead time typed" : `${v.lead_time_days} day lead`;
  const observed = v.observed.map((o) =>
    `observed ${fmtVendorQty(o.avg_lead_days)} days over ${o.n} ${o.n === 1 ? "order" : "orders"} sent ${PO_SENT_VIA[o.sent_via] ?? o.sent_via}`);
  return [typed, ...observed, `${v.contracts.length} ${v.contracts.length === 1 ? "contract" : "contracts"}`].join(" · ");
}

export function toVendorsViewProps(s: VendorsSnapshot): VendorsViewModel {
  const rows = s.rows ?? [];
  return {
    backHref: s.backHref,
    rows,
    materials: s.materials ?? "",
    contracts: s.contracts ?? "",
    empty: rows.length > 0 ? undefined
      : s.filtered ? { title: "No vendors match", description: "Clear the search to see every vendor." }
      : { title: "No vendors yet", description: "Add the suppliers you buy materials from." },
  };
}
