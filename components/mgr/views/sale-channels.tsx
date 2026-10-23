// components/mgr/views/sale-channels.tsx — Sale channels list. Live passes
// ChannelForm as createAction, ChannelForm + DeleteChannelControl (delete-channel.tsx) via rowTrailing, and the
// tax-treatment info string; inventory uses Add channel and unlabeled nav.
// The model's inUseRule draws whenever the model carries it: a role that may
// delete sees it when some row has no Delete, and the inventory frame draws
// the Admin persona. It is an info note: a standing rule, not a warning.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { SaleChannelsRowView, SaleChannelsViewModel } from "@/lib/mgr/sale-channels-view";

export type { SaleChannelsViewModel };

export function SaleChannelsView({
  model,
  backLabel = "Settings",
  createAction,
  info,
  rowTrailing,
  linkRows,
}: {
  model: SaleChannelsViewModel;
  /** Live: "More" for a role that cannot open Settings. */
  backLabel?: string;
  createAction?: ReactNode;
  /** Live tax-treatment copy. Inventory omits this. */
  info?: string;
  /** Live: ChannelForm + DeleteChannelControl where row.deletable. Inventory draws E.nav. */
  rowTrailing?: (row: SaleChannelsRowView) => ReactNode;
  /** Live list: nav rows are links. Inventory leaves them unlabeled taps. */
  linkRows?: boolean;
}) {
  return (
    <>
      {E.back(backLabel, "Sale channels", createAction !== undefined ? createAction : E.btn("Add channel"), model.backHref)}
      {info ? E.info(info) : null}
      {model.inUseRule ? E.info(model.inUseRule) : null}
      {model.empty
        ? E.blank(model.empty)
        : model.rows.map((row) => (
          <Fragment key={row.key}>
            {rowTrailing
              ? E.row(row.title, row.detail, rowTrailing(row))
              : E.nav(row.title, row.detail, "", undefined, linkRows ? row.href : undefined)}
          </Fragment>
        ))}
    </>
  );
}
