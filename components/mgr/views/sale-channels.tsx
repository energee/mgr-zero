// components/mgr/views/sale-channels.tsx — Sale channels list. Live passes
// ChannelForm as createAction, DeleteChannelButton via rowTrailing, and the
// tax-treatment info string; inventory uses Add channel and unlabeled nav.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { SaleChannelsViewModel } from "@/lib/mgr/sale-channels-view";

export type { SaleChannelsViewModel };

export function SaleChannelsView({
  model,
  createAction,
  info,
  rowTrailing,
  linkRows,
}: {
  model: SaleChannelsViewModel;
  createAction?: ReactNode;
  /** Live tax-treatment copy. Inventory omits this. */
  info?: string;
  /** Live: ChannelForm + DeleteChannelButton. Inventory draws E.nav. */
  rowTrailing?: (id: string) => ReactNode;
  /** Live list: nav rows are links. Inventory leaves them unlabeled taps. */
  linkRows?: boolean;
}) {
  return (
    <>
      {E.back("Settings", "Sale channels", createAction ?? E.btn("Add channel"), model.backHref)}
      {info ? E.info(info) : null}
      {model.empty
        ? E.blank(model.empty)
        : model.rows.map((row) => (
          <Fragment key={row.key}>
            {rowTrailing
              ? E.row(row.title, row.detail, rowTrailing(row.key))
              : E.nav(row.title, row.detail, "", undefined, linkRows ? row.href : undefined)}
          </Fragment>
        ))}
    </>
  );
}
