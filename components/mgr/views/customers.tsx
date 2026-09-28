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
  backHref,
}: {
  model: CustomersViewModel;
  createAction?: ReactNode;
  /** Live has no search yet; pass null to hide. Inventory draws E.search. */
  search?: ReactNode;
  linkRows?: boolean;
  backHref?: string;
}) {
  return (
    <>
      {E.back("More", "Customers", createAction !== undefined ? createAction : E.btn("Add customer"), backHref)}
      {model.missingPortalEmail && E.info("Customers without a current portal login email. Open a customer and use Invite to add buyer access; Remove access replaces an obsolete login. Email presence is a readiness check, not proof of delivery or sending.")}
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
