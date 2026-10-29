// lib/mgr/vendor-detail-view.ts — view model for one vendor's page (#1586):
// its facts, its contracts read-only with the four drawdown numbers, its open
// purchase orders (null when the viewer's role may not read orders) and the
// materials whose default vendor it is. Status and lead times come from the
// Vendors list's own row, so both pages word them the same.
import type { EmptyState } from "./empty-state";
import { contractRowView, toContractsViewProps, type ContractBalance, type ContractsViewModel } from "./contracts-view";
import { poNo } from "./doc-no";
import { paymentTermLabel, sentenceCase } from "./labels";
import { poListStatus, purchaseOrderNext, type PurchaseOrdersRowView } from "./purchase-orders-view";
import { toVendorsRow, type VendorsVendor } from "./vendors-view";

/** One list_vendors_and_contracts row, keyed by its id. */
export type VendorRecord = VendorsVendor & {
  email: string | null;
  phone: string | null;
  payment_terms: string;
  contracts: ContractBalance[];
};

/** The fields of one list_purchase_orders row that its list status needs. */
export type VendorPo = {
  id: string; po_no: number | null; status: string; closed_at: string | null;
  ordered_on: string | null; expected_on: string | null; lines_open: number;
};

/** One list_materials row. */
export type VendorMaterial = { id: string; name: string; category: string; purchase_uom: string; active: boolean };

export type VendorDetailSnapshot = {
  backHref?: string;
  vendor: VendorRecord;
  /** null: the viewer's role cannot read purchase orders (Brewer). */
  purchaseOrders: VendorPo[] | null;
  materials: VendorMaterial[];
};

type Rows<Row> = { rows: Row[]; empty?: EmptyState };

export type VendorDetailViewModel = {
  backHref?: string;
  title: string;
  facts: [string, string][];
  contracts: ContractsViewModel;
  purchaseOrders: Rows<PurchaseOrdersRowView> | null;
  materials: Rows<{ key: string; title: string; detail: string }>;
};

const NO_OPEN_ORDERS: EmptyState = { title: "No open purchase orders", description: "Drafted, sent and partly received orders from this vendor show here." };
const NO_MATERIALS: EmptyState = { title: "No default materials", description: "A material names its default vendor on Materials on hand." };

const withEmpty = <Row>(rows: Row[], empty: EmptyState): Rows<Row> => ({ rows, empty: rows.length ? undefined : empty });

export function toVendorDetailViewProps(s: VendorDetailSnapshot): VendorDetailViewModel {
  const v = s.vendor;
  const row = toVendorsRow(v);
  const facts: [string, string][] = [
    ["Status", row.status],
    ...(v.email ? [["Email", v.email] as [string, string]] : []),
    ...(v.phone ? [["Phone", v.phone] as [string, string]] : []),
    ["Terms", paymentTermLabel(v.payment_terms)],
    ["Lead time", row.leadTime],
    ["Observed lead time", row.observed ?? "No received orders yet"],
  ];
  return {
    backHref: s.backHref,
    title: v.name,
    facts,
    contracts: toContractsViewProps({ rows: v.contracts.map((c) => contractRowView(c)) }),
    purchaseOrders: s.purchaseOrders && withEmpty(s.purchaseOrders.map((po) => ({
      key: po.id,
      title: poNo(po.po_no),
      detail: poListStatus(po),
      ...purchaseOrderNext(po.status),
      warning: po.status === "partially_received",
      href: `/purchase-orders/${po.id}`,
    })), NO_OPEN_ORDERS),
    materials: withEmpty(s.materials.map((m) => ({
      key: m.id,
      title: m.name,
      detail: `${sentenceCase(m.category)} · ${m.purchase_uom}${m.active ? "" : " · Inactive"}`,
    })), NO_MATERIALS),
  };
}
