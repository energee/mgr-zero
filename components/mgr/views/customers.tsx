// components/mgr/views/customers.tsx — Customers list, a RecordTable as Orders
// is: the name (with alias), then Type, Region, Channel and Terms. Live passes
// CustomerForm as createAction and linkRows, so a name opens that customer in
// a sheet over the list (?customer=, lib/mgr/order-sheet.ts), and the page
// passes the open sheet; inventory uses New customer and inert names.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { CUSTOMER_SHEET_PARAM } from "@/lib/mgr/order-sheet";
import type { CustomersViewModel } from "@/lib/mgr/customers-view";
import { RecordTable } from "./record-table";

export function CustomersView({
  model,
  createAction,
  search,
  linkRows,
  backHref,
  sheet,
}: {
  model: CustomersViewModel;
  createAction?: ReactNode;
  /** The search strip (components/mgr/list-controls.tsx), in live and inventory alike. */
  search?: ReactNode;
  linkRows?: boolean;
  backHref?: string;
  /** Live: the customer sheet the page opened from ?customer= (app/(app)/customers/customer-sheet.tsx), drawn over the list. */
  sheet?: ReactNode;
}) {
  return (
    <>
      {E.back("More", "Customers", createAction !== undefined ? createAction : E.btn("New customer"), backHref)}
      {model.missingPortalEmail && E.info("Customers without a current portal login email. Open a customer and use Invite to add buyer access; Remove access replaces an obsolete login. Email presence is a readiness check, not proof of delivery or sending.")}
      {search}
      {model.empty
        ? E.blank(model.empty)
        : (
          <RecordTable
            headers={["Customer", "Type", "Region", "Channel", "Terms"]}
            align={["l", "l", "l", "l", "l"]}
            rows={model.rows.map((row) => ({
              key: row.key,
              sheet: linkRows ? { param: CUSTOMER_SHEET_PARAM, id: row.key } : undefined,
              to: "Customer detail",
              note: row.note && (row.warning ? E.status(row.note, "w") : row.note),
              cells: [row.title, row.type, row.region, row.channel, row.terms],
            }))}
          />
        )}
      {sheet}
    </>
  );
}
