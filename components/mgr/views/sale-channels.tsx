// components/mgr/views/sale-channels.tsx — Sale channels list. Live passes
// ChannelForm as createAction, ChannelForm + DeleteChannelControl via rowTrailing, and the
// tax-treatment info string; inventory uses Add channel and unlabeled nav.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { SaleChannelsViewModel } from "@/lib/mgr/sale-channels-view";
import { ConfirmDeleteControl } from "./confirm-delete";

export type { SaleChannelsViewModel };

/** A row's Delete: confirm, then delete_sale_channel. Live mounts it through DeleteCommandButton. */
export function DeleteChannelControl({ name, ...rest }: { name: string; busy?: boolean; error?: string | null; onDelete?: () => Promise<boolean> }) {
  return <ConfirmDeleteControl title={`Delete ${name}`} triggerLabel="Delete" size="sm" {...rest}
    name={<>Delete the <strong>{name}</strong> sale channel? This cannot be undone.</>}
    warning="A channel a movement, customer, order or price cell uses cannot be deleted." />;
}

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
  /** Live: ChannelForm + DeleteChannelControl. Inventory draws E.nav. */
  rowTrailing?: (id: string) => ReactNode;
  /** Live list: nav rows are links. Inventory leaves them unlabeled taps. */
  linkRows?: boolean;
}) {
  return (
    <>
      {E.back(backLabel, "Sale channels", createAction !== undefined ? createAction : E.btn("Add channel"), model.backHref)}
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
