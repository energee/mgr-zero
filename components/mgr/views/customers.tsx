// components/mgr/views/customers.tsx — Customers list. Live passes
// CustomerForm as createAction and linkRows; inventory uses New customer
// and unlinked rows.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { CustomersViewModel } from "@/lib/mgr/customers-view";

export function CustomersView({
  model,
  createAction,
  search,
  linkRows,
  backHref,
}: {
  model: CustomersViewModel;
  createAction?: ReactNode;
  /** The search strip (components/mgr/list-controls.tsx), in live and inventory alike. */
  search?: ReactNode;
  linkRows?: boolean;
  backHref?: string;
}) {
  return (
    <>
      {E.back("More", "Customers", createAction !== undefined ? createAction : E.btn("New customer"), backHref)}
      {model.missingPortalEmail && E.info("Customers without a current portal login email. Open a customer and use Invite to add buyer access; Remove access replaces an obsolete login. Email presence is a readiness check, not proof of delivery or sending.")}
      {search}
      {model.empty
        ? E.blank(model.empty)
        : model.rows.map((row) => (
          <Fragment key={row.key}>
            {E.nav(row.title, row.detail, row.warning ? "w" : "", undefined, linkRows ? row.href : undefined)}
          </Fragment>
        ))}
    </>
  );
}
