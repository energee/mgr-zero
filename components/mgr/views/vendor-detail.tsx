// components/mgr/views/vendor-detail.tsx — one vendor's page (#1586), drawn
// once for the inventory and the live route: its facts, its contracts
// read-only with the four drawdown numbers, its open purchase orders (left
// out when the viewer's role cannot read orders), and its default materials.
// Live passes VendorForm as the Edit action and links each order; the
// inventory draws an Edit button and inert rows.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { ContractsView } from "@/components/mgr/views/contracts";
import { PurchaseOrderRows } from "@/components/mgr/views/purchase-orders";
import type { VendorDetailViewModel } from "@/lib/mgr/vendor-detail-view";

export function VendorDetailView({ model, editAction, linkRows }: {
  model: VendorDetailViewModel;
  /** Live: the Edit vendor sheet, which also holds Deactivate vendor. */
  editAction?: ReactNode;
  /** Live: each purchase order row links to its page. */
  linkRows?: boolean;
}) {
  const { purchaseOrders, materials } = model;
  return (
    <>
      {E.back("Vendors", model.title, editAction ?? E.btn("Edit"), model.backHref)}
      {model.facts.map(([label, value]) => <Fragment key={label}>{E.fld(label, value)}</Fragment>)}
      <ContractsView model={model.contracts} header={E.group("Contracts")} />
      {purchaseOrders && (
        <>
          {E.group("Open purchase orders")}
          {purchaseOrders.empty ? E.blank(purchaseOrders.empty) : <PurchaseOrderRows rows={purchaseOrders.rows} linkRows={linkRows} />}
        </>
      )}
      {E.group("Default materials")}
      {materials.empty
        ? E.blank(materials.empty)
        : materials.rows.map((row) => <Fragment key={row.key}>{E.row(row.title, row.detail)}</Fragment>)}
    </>
  );
}
