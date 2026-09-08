// components/mgr/views/portal-orders.tsx — portal Order history. Live passes
// linkRows so verbs/nav are real links; inventory leaves taps unlabeled.
import Link from "next/link";
import { Fragment } from "react";
import { E } from "@/components/mgr/e";
import type { PortalOrdersViewModel } from "@/lib/mgr/portal-orders-view";

export type { PortalOrdersViewModel };

export function PortalOrdersView({
  model,
  linkRows,
}: {
  model: PortalOrdersViewModel;
  /** Live list: Reorder and nav rows are links. Inventory leaves them unlabeled. */
  linkRows?: boolean;
}) {
  return (
    <>
      {E.hd("Orders", model.subtitle)}
      {model.empty
        ? E.blank(model.empty)
        : model.rows.map((row) => (
          <Fragment key={row.key}>
            {row.verb
              ? E.row(linkRows ? <Link href={row.href} className="underline underline-offset-4">{row.title}</Link> : row.title, row.detail, E.act(row.verb, "primary", linkRows ? row.actionHref : undefined), row.warning ? "w" : "")
              : E.nav(row.title, row.detail, row.warning ? "w" : "", undefined, linkRows ? row.href : undefined)}
          </Fragment>
        ))}
      {E.info(model.info)}
    </>
  );
}
