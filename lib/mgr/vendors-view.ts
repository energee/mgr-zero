// lib/mgr/vendors-view.ts — view-model for the Vendors list.
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
  empty?: string;
};

export type VendorsSnapshot = {
  backHref?: string;
  rows?: VendorsRowView[];
  materials?: string;
  contracts?: string;
};

export function toVendorsViewProps(s: VendorsSnapshot): VendorsViewModel {
  const rows = s.rows ?? [];
  return {
    backHref: s.backHref,
    rows,
    materials: s.materials ?? "",
    contracts: s.contracts ?? "",
    empty: rows.length === 0 ? "No vendors yet" : undefined,
  };
}
