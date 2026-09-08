// components/mgr/views/portal-account.tsx — portal Account drawing. Inventory
// and the live page both mount this view from toPortalAccountViewProps.
import { Fragment } from "react";
import { E } from "@/components/mgr/e";
import type { PortalAccountViewModel } from "@/lib/mgr/portal-account-view";

export type { PortalAccountViewModel };

export function PortalAccountView({ model }: { model: PortalAccountViewModel }) {
  return (
    <>
      {E.hd("Account", model.customer)}
      {model.shipTos.map((s) => (
        <Fragment key={s.key}>{E.row(s.title, s.detail)}</Fragment>
      ))}
      {E.row(model.membership.title, model.membership.detail, model.membership.trailing)}
      {model.deposits.map((d) => (
        <Fragment key={d.key}>{E.row(d.title, d.detail, d.amount)}</Fragment>
      ))}
      {E.info(model.info)}
    </>
  );
}
