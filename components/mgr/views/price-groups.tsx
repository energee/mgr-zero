// components/mgr/views/price-groups.tsx — Price groups grid, one table per
// sale channel, drawn once for both surfaces. Inventory draws E.link for the
// group and the cell's label; live hands in GroupForm / PriceCellForm through
// the renderGroup / renderCell slots and keeps the same table around them.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { PriceGroupsChannelView, PriceGroupsRowView, PriceGroupsViewModel } from "@/lib/mgr/price-groups-view";

export type { PriceGroupsViewModel };

export function PriceGroupsView({
  model,
  createAction,
  renderGroup = (row) => E.link(row.name, "Price group"),
  renderCell = (_channel, _row, _col, label) => label,
  backHref,
}: {
  model: PriceGroupsViewModel;
  createAction?: ReactNode;
  /** The row's first cell: the group's name, opening the group. */
  renderGroup?: (row: PriceGroupsRowView) => ReactNode;
  /** One price cell; `label` is the money string or the muted "not priced". */
  renderCell?: (channel: PriceGroupsChannelView, row: PriceGroupsRowView, col: number, label: ReactNode) => ReactNode;
  backHref?: string;
}) {
  return (
    <>
      {E.back("More", "Price groups", createAction !== undefined ? createAction : E.btn("Create price group"), backHref)}
      {E.info("Price groups down, formats across, one table per sale channel. A beer sits on one group and a customer on one channel; the cell where they meet is the price.")}
      {model.groupCount === 0 ? E.blank("Add a price group, then put each brand on one from Catalog.")
        : model.channels.length === 0 ? E.blank("No sale channels yet")
        : model.channels.map((channel) => (
        <Fragment key={channel.id}>
          {E.ttl(channel.name)}
          <div className="min-w-0 overflow-x-auto">
            {E.tbl(
              ["Group", ...model.formats],
              channel.rows.map((row) => [
                renderGroup(row),
                ...row.cells.map((cell, col) => row.formatIds[col]
                  ? renderCell(channel, row, col, cell ?? <span className="text-muted-foreground">not priced</span>)
                  : null),
              ]),
            )}
          </div>
        </Fragment>
      ))}
    </>
  );
}
