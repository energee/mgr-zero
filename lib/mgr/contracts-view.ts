// lib/mgr/contracts-view.ts — view-model for the Contracts list, which the
// Vendors page and one vendor's page (#1586) both draw.
import type { EmptyState } from "./empty-state";
import { fmtVendorQty as fmt } from "./vendors-view";

export type ContractsRowView = {
  key: string;
  title: string;
  detail: string;
  /** The row's action; a read-only list (one vendor's page) has none. */
  verb?: string;
  warning?: boolean;
};

/** One list_vendors_and_contracts contract with its four drawdown numbers. */
export type ContractBalance = {
  id: string; contract_no: string | null; material_name: string | null;
  qty_committed: number; qty_received: number; qty_on_order: number; qty_available: number;
};

/** One contract's row. The Vendors list names the vendor and offers Edit,
 *  because only it mounts ContractForm; a vendor's own page passes no name,
 *  so its rows are read-only. */
export function contractRowView(c: ContractBalance, vendorName?: string): ContractsRowView {
  const name = c.contract_no ?? c.material_name ?? "contract";
  return {
    key: c.id,
    title: vendorName ? `${vendorName} · ${name}` : name,
    detail: `${fmt(c.qty_committed)} committed · ${fmt(c.qty_received)} received · ${fmt(c.qty_on_order)} on order · ${fmt(c.qty_available)} available`,
    verb: vendorName ? "Edit" : undefined,
    warning: c.qty_available <= 0,
  };
}

export type ContractsViewModel = {
  backHref?: string;
  rows: ContractsRowView[];
  empty?: EmptyState;
};

export type ContractsSnapshot = {
  backHref?: string;
  rows?: ContractsRowView[];
  /** A vendor search is on, so an empty list means no match, not no contracts. */
  filtered?: boolean;
};

export function toContractsViewProps(s: ContractsSnapshot): ContractsViewModel {
  const rows = s.rows ?? [];
  return {
    backHref: s.backHref,
    rows,
    empty: rows.length > 0 ? undefined
      : s.filtered ? { title: "No contracts match", description: "Clear the search to see every contract." }
      : { title: "No contracts yet", description: "A contract records a quantity of a material a vendor commits to supply, which purchase orders then draw down." },
  };
}
