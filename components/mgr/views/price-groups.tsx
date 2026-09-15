// components/mgr/views/price-groups.tsx — Price groups grid. Live passes
// GroupForm as createAction and its form tables as tables; inventory draws
// E.tbl / E.link("1", "Price group") from the adapter.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { PriceGroupsViewModel } from "@/lib/mgr/price-groups-view";

export type { PriceGroupsViewModel };

/** Unpriced cells recede so the priced ones read as the sheet. */
const unpricedDim = (cell: string | number) => cell === "not priced" ? <span className="text-muted-foreground">{cell}</span> : cell;

export function PriceGroupsView({
  model,
  createAction,
  tables,
  backHref,
}: {
  model: PriceGroupsViewModel;
  createAction?: ReactNode;
  /** Live: E.tbl with GroupForm / PriceCellForm. Inventory omits this. */
  tables?: ReactNode;
  backHref?: string;
}) {
  return (
    <>
      {E.back("More", "Price groups", createAction !== undefined ? createAction : E.btn("Create price group"), backHref)}
      {E.info("Price groups down, formats across, one table per sale channel. A beer sits on one group and a customer on one channel; the cell where they meet is the price.")}
      {tables !== undefined ? tables : model.channels.map((channel) => (
        <Fragment key={channel.name}>
          {E.ttl(channel.name)}
          <div className="min-w-0 overflow-x-auto">
            {E.tbl(
              channel.headers,
              channel.rows.map((row) => [E.link(row[0], "Price group"), ...row.slice(1).map(unpricedDim)]),
            )}
          </div>
        </Fragment>
      ))}
    </>
  );
}
