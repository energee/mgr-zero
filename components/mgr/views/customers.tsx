// components/mgr/views/customers.tsx — Customers list. Live passes
// CustomerForm as createAction and linkRows; inventory uses Add customer
// and unlabeled Open.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { CustomersViewModel } from "@/lib/mgr/customers-view";

export type { CustomersViewModel };

export function CustomersView({
  model,
  createAction,
  search,
  linkRows,
}: {
  model: CustomersViewModel;
  createAction?: ReactNode;
  /** Live has no search yet; pass null to hide. Inventory draws E.search. */
  search?: ReactNode;
  linkRows?: boolean;
}) {
  return (
    <>
      {E.back("More", "Customers", createAction ?? E.btn("Add customer"), "/more")}
      {search !== undefined ? search : E.search("Search customers")}
      {model.empty
        ? E.blank(model.empty)
        : model.rows.map((row) => (
          <Fragment key={row.key}>
            {E.row(row.title, row.detail, E.act("Open", "primary", linkRows ? row.href : undefined), row.warning ? "w" : "")}
          </Fragment>
        ))}
    </>
  );
}
