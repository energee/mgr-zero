// components/mgr/views/locations.tsx — Locations list. Live passes
// LocationForm as createAction, linkRows, and an Inventory-by-location
// footer; inventory uses Add location and unlabeled Edit.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { LocationsViewModel } from "@/lib/mgr/locations-view";

export type { LocationsViewModel };

export function LocationsView({
  model,
  createAction,
  footer,
  linkRows,
}: {
  model: LocationsViewModel;
  createAction?: ReactNode;
  /** Live: Inventory by location. Inventory omits this. */
  footer?: ReactNode;
  /** Live list: Edit is a link. Inventory leaves it unlabeled. */
  linkRows?: boolean;
}) {
  return (
    <>
      {E.back("Settings", "Locations", createAction !== undefined ? createAction : E.btn("Add location"), model.backHref)}
      {model.empty
        ? E.blank(model.empty)
        : model.rows.map((row) => (
          <Fragment key={row.key}>
            {E.row(row.title, row.detail, E.act("Edit", "primary", linkRows ? row.href : undefined))}
          </Fragment>
        ))}
      {footer}
    </>
  );
}
