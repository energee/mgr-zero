// components/mgr/views/portal-orders.tsx — portal Order history. Live passes
// linkRows so nav rows are real links; inventory leaves taps unlabeled.
// Reorder is on Order detail, not these rows.
import { Fragment } from "react";
import { E } from "@/components/mgr/e";
import type { PortalOrdersViewModel } from "@/lib/mgr/portal-orders-view";

export type { PortalOrdersViewModel };

export function PortalOrdersView({
  model,
  linkRows,
}: {
  model: PortalOrdersViewModel;
  /** Live list: each row is the order-detail link. Inventory leaves them unlabeled. */
  linkRows?: boolean;
}) {
  return (
    <>
      {E.hd("Orders", model.subtitle)}
      {model.empty
        ? E.blank(model.empty)
        : model.rows.map((row) => (
          <Fragment key={row.key}>
            {E.nav(row.title, row.detail, row.warning ? "w" : "", undefined, linkRows ? row.href : undefined)}
          </Fragment>
        ))}
      {E.info(model.info)}
    </>
  );
}
