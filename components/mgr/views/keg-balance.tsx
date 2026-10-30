// components/mgr/views/keg-balance.tsx — Customer keg balance. Live maps
// get_customer_keg_balance and passes each row's Record return (a prefilled
// Record keg event) as rowActions; inventory draws the row verbs inert and
// includes the overdue row.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { KegBalanceViewModel } from "@/lib/mgr/keg-balance-view";

export function KegBalanceView({
  model,
  footer,
  rowActions,
}: {
  model: KegBalanceViewModel;
  footer?: ReactNode;
  /** Live: each row's Record return by row key, or null for a row with no keg out. */
  rowActions?: Record<string, ReactNode>;
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
              <span className="flex items-center gap-2">
                {row.trailing && <span className="text-sm text-muted-foreground">{row.trailing}</span>}
                {rowActions ? rowActions[row.key] : row.verb && E.act(row.verb)}
              </span>,
              row.warning ? "w" : "",
            )}
          </Fragment>
        ))}
      {footer}
      {E.info("Beer returns use Return shipment. Record return records empty kegs coming back.")}
    </>
  );
}
