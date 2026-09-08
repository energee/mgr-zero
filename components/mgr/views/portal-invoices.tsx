// components/mgr/views/portal-invoices.tsx — Portal Invoice history. Live
// passes linkRows so unpaid totals are the invoice link; inventory leaves
// Pay unlabeled. Rows come from toPortalInvoicesViewProps(portal_invoices).
import { Fragment } from "react";
import { E } from "@/components/mgr/e";
import type { PortalInvoicesViewModel } from "@/lib/mgr/portal-invoices-view";

export type { PortalInvoicesViewModel };

export function PortalInvoicesView({
  model,
  linkRows,
}: {
  model: PortalInvoicesViewModel;
  /** Live list: unpaid trailing is money linking to the invoice. Inventory draws Pay. */
  linkRows?: boolean;
}) {
  return (
    <>
      {E.hd("Invoices", model.subtitle)}
      {model.empty
        ? E.blank(model.empty)
        : model.rows.map((row) => (
          <Fragment key={row.key}>
            {E.row(
              row.title,
              row.unpaid && !linkRows ? `${row.detail} · ${row.total}` : row.detail,
              row.unpaid
                ? E.act(linkRows ? row.total : "Pay", "info", linkRows ? row.href : undefined)
                : row.total,
              row.tone,
            )}
          </Fragment>
        ))}
    </>
  );
}
