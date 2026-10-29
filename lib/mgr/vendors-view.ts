// lib/mgr/vendors-view.ts — view-model for the Vendors list. Each vendor from
// list_vendors_and_contracts becomes one RecordTable row: name, status, the
// typed lead time, the observed averages, and how many contracts it holds.
import type { EmptyState } from "./empty-state";
import { PO_SENT_VIA } from "./purchase-orders-view";

/** One vendor as list_vendors_and_contracts returns it, keyed by its id. */
export type VendorsVendor = {
  key: string;
  name: string;
  active: boolean;
  lead_time_days: number | null;
  observed: { sent_via: string; n: number; avg_lead_days: number }[];
  contracts: unknown[];
};

export type VendorsRowView = {
  key: string;
  name: string;
  status: "Active" | "Inactive";
  /** The typed lead time, "7 days", or "Not typed". */
  leadTime: string;
  /** Each observed average with how many orders it rests on and how they were
   *  sent (#1501), or null before any order is received. */
  observed: string | null;
  contracts: number;
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
  rows?: VendorsVendor[];
  materials?: string;
  contracts?: string;
  /** A search is on, so an empty list means no match, not no vendors. */
  filtered?: boolean;
};

/** The Vendors list's number format: thousands separated, at most two decimals. */
export const fmtVendorQty = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

const days = (n: number) => `${fmtVendorQty(n)} ${n === 1 ? "day" : "days"}`;

function toRow(v: VendorsVendor): VendorsRowView {
  const observed = v.observed.map((o) =>
    `${days(o.avg_lead_days)} over ${o.n} ${o.n === 1 ? "order" : "orders"} sent ${PO_SENT_VIA[o.sent_via] ?? o.sent_via}`);
  return {
    key: v.key,
    name: v.name,
    status: v.active ? "Active" : "Inactive",
    leadTime: v.lead_time_days === null ? "Not typed" : days(v.lead_time_days),
    observed: observed.length ? observed.join(" · ") : null,
    contracts: v.contracts.length,
  };
}

export function toVendorsViewProps(s: VendorsSnapshot): VendorsViewModel {
  const rows = (s.rows ?? []).map(toRow);
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
