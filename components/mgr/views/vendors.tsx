// components/mgr/views/vendors.tsx — Vendors list, drawn by the shared
// RecordTable (#1516): name, status, typed and observed lead time, contract
// count, then Edit. The name opens the vendor's page (#1586): a link with
// linkRows, an inert tap to Vendor detail in the inventory. Live slots
// VendorForm as each row's Edit and the contracts footer; inventory draws Edit
// and the Materials / Contracts navs.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { RecordTable } from "@/components/mgr/views/record-table";
import type { VendorsRowView, VendorsViewModel } from "@/lib/mgr/vendors-view";

export function VendorsView({
  model,
  header,
  controls,
  createAction,
  rowTrailing,
  footer,
  linkRows,
}: {
  model: VendorsViewModel;
  header?: ReactNode;
  /** The search strip (components/mgr/list-controls.tsx). */
  controls?: ReactNode;
  createAction?: ReactNode;
  rowTrailing?: (row: VendorsRowView) => ReactNode;
  footer?: ReactNode;
  /** Live: each name links to its vendor page. */
  linkRows?: boolean;
}) {
  return (
    <>
      {header ?? E.back("More", "Vendors", createAction !== undefined ? createAction : E.btn("Add vendor"), model.backHref)}
      {controls}
      {model.empty
        ? E.blank(model.empty)
        : <RecordTable
          // The action column needs no visible header: its button names the verb.
          headers={["Vendor", "Status", "Lead time", "Observed lead time", "Contracts", <span key="action" className="sr-only">Actions</span>]}
          align={["l", "l", "l", "l", "r", "l"]}
          rows={model.rows.map((row) => ({
            key: row.key,
            href: linkRows ? row.href : undefined,
            to: "Vendor detail",
            cells: [
              row.name, row.status, row.leadTime, row.observed, row.contracts,
              <span key="action">{rowTrailing ? rowTrailing(row) : E.act("Edit")}</span>,
            ],
          }))}
        />}
      {footer ?? (
        <>
          {E.nav("Materials", model.materials)}
          {E.nav("Contracts", model.contracts)}
        </>
      )}
    </>
  );
}
