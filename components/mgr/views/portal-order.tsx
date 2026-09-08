// components/mgr/views/portal-order.tsx — portal Order detail. Inventory and
// the live page both pass toPortalOrderViewProps(portal_order-shaped data).
// Live passes footer as the Reorder link; inventory draws the unlabeled button.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { PortalOrderViewModel } from "@/lib/mgr/portal-order-view";

export type { PortalOrderViewModel };

export function PortalOrderView({
  model,
  footer,
  linkRows,
  reorderHref,
  continueHref,
}: {
  model: PortalOrderViewModel;
  /** Live: Reorder with href. Inventory draws E.btn when model.reorder. */
  footer?: ReactNode;
  /** Live: the invoice row is a link. Inventory leaves the tap unlabeled. */
  linkRows?: boolean;
  reorderHref?: string;
  continueHref?: string;
}) {
  return (
    <>
      {E.back("Orders", model.title, undefined, model.backHref)}
      {E.fld("Status", model.status)}
      {model.shipTo ? E.fld("Ship-to", model.shipTo) : null}
      {model.requested ? E.fld("Requested", model.requested) : null}
      {model.po ? E.fld("Your PO", model.po) : null}
      {model.note ? E.fld("Note", model.note) : null}
      {model.lines.map((line) => (
        <Fragment key={line.key}>
          {E.row(line.name, line.detail, line.amount, line.warning ? "w" : "")}
        </Fragment>
      ))}
      {model.adjusted ? E.info(model.adjusted) : null}
      {model.invoice
        ? E.nav(
          model.invoice.title,
          `${model.invoice.detail} · ${model.invoice.amount}`,
          model.invoice.paid ? "ok" : "",
          undefined,
          linkRows ? model.invoice.href : undefined,
        )
        : null}
      {footer ?? (continueHref ? E.btn("Continue / edit", "p", continueHref) : model.reorder ? E.btn("Reorder", "g", reorderHref) : null)}
    </>
  );
}
