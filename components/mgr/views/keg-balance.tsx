// components/mgr/views/keg-balance.tsx — Customer keg balance. Live maps
// get_customer_keg_balance; inventory includes the overdue row.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { KegBalanceViewModel } from "@/lib/mgr/keg-balance-view";

export type { KegBalanceViewModel };

export function KegBalanceView({
  model,
  footer,
}: {
  model: KegBalanceViewModel;
  footer?: ReactNode;
}) {
  return (
    <>
      {E.back("Keg fleet", model.customer, undefined, model.backHref)}
      {E.num(model.kegs, model.deposits)}
      {model.empty
        ? E.blank(model.empty)
        : model.rows.map((row) => (
          <Fragment key={row.key}>
            {E.row(
              row.title,
              row.detail,
              row.verb ? E.act(row.verb) : row.trailing,
              row.warning ? "w" : "",
            )}
          </Fragment>
        ))}
      {footer}
      {E.info("Beer returns use Return shipment. Empty keg returns are recorded from Keg fleet.")}
    </>
  );
}
