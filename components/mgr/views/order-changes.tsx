// components/mgr/views/order-changes.tsx — Changes after confirm: the staff
// report of order changes made after the brewery confirmed (Phase C of
// docs/plans/portal-release-windows.md), newest first, filtered by Reason,
// Staff and Customer picks (ScopePick, so the URL holds the filters). A row
// opens its order on the live page. Inventory and the live page draw the same view.
import { Fragment } from "react";
import { E } from "@/components/mgr/e";
import { ScopePick } from "@/components/mgr/scope-pick";
import type { OrderChangesViewModel } from "@/lib/mgr/order-changes-view";

/** `pagination` is the live page's Newest and More links (historyPage); inventory draws one page. */
export function OrderChangesView({ model, pagination }: { model: OrderChangesViewModel; pagination?: { moreHref?: string; firstHref?: string } }) {
  return (
    <>
      {E.back("More", "Changes after confirm", undefined, model.backHref)}
      {E.cols(
        <ScopePick label="Reason" value={model.reason} options={model.reasonOptions} />,
        <ScopePick label="Staff" value={model.staff} options={model.staffOptions} />,
        <ScopePick label="Customer" value={model.customer} options={model.customerOptions} search />,
      )}
      {model.empty
        ? E.blank(model.empty)
        : model.rows.map((row) => (
          <Fragment key={row.key}>
            {row.href ? E.nav(row.title, row.detail, "", undefined, row.href) : E.row(row.title, row.detail)}
          </Fragment>
        ))}
      {(pagination?.firstHref || pagination?.moreHref) && <nav aria-label="History pages" className="flex gap-2">
        {pagination.firstHref && E.act("Newest", undefined, pagination.firstHref)}
        {pagination.moreHref && E.act("More", "primary", pagination.moreHref)}
      </nav>}
    </>
  );
}
