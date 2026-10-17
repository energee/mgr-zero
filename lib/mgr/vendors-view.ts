// lib/mgr/vendors-view.ts — view-model for the Vendors list.
import type { EmptyState } from "./empty-state";
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
