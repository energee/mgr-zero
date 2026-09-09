// components/mgr/views/location-bins.tsx — Location bins list. Live passes
// BinForm as createAction and a bins slot; inventory uses Add bin and nav.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { LocationBinsViewModel } from "@/lib/mgr/location-bins-view";

export type { LocationBinsViewModel };

export function LocationBinsView({
  model,
  createAction,
  footer,
  bins,
}: {
  model: LocationBinsViewModel;
  createAction?: ReactNode;
  footer?: ReactNode;
  /** Live: one row per bin with BinForm in action. */
  bins?: { key: string; title: string; detail: string; action?: ReactNode }[];
}) {
  return (
    <>
      {E.back(model.backLabel, "Bins", createAction, model.backHref)}
      {bins
        ? bins.map((row) => (
          <Fragment key={row.key}>{E.row(row.title, row.detail, row.action)}</Fragment>
        ))
        : model.rows.map((row) => (
          <Fragment key={row.key}>{E.nav(row.title, row.detail)}</Fragment>
        ))}
      {footer !== undefined ? footer : (createAction !== undefined ? null : E.btn("Add bin", "g"))}
    </>
  );
}
