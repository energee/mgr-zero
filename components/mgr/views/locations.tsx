// components/mgr/views/locations.tsx — Locations list and its cross-location stock link.
import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { E } from "@/components/mgr/e";
import type { LocationsViewModel } from "@/lib/mgr/locations-view";

export function LocationsInventoryLink({ href = "#" }: { href?: string }) {
  return <Link href={href} data-to="Finished goods" className="text-xs text-muted-foreground underline underline-offset-2">See finished goods across all locations</Link>;
}

export function LocationsView({
  model,
  createAction,
  footer,
  linkRows,
  backLabel = "Settings",
  rowActionLabel = "Edit",
}: {
  model: LocationsViewModel;
  createAction?: ReactNode;
  /** Live supplies an authorized destination or null to hide the inventory link. */
  footer?: ReactNode;
  /** Live list: Edit is a link. Inventory leaves it unlabeled. */
  linkRows?: boolean;
  backLabel?: string;
  rowActionLabel?: string;
}) {
  return (
    <>
      {E.back(backLabel, "Locations", createAction !== undefined ? createAction : E.btn("Add location"), model.backHref)}
      {E.info("Locations cannot be deleted or archived; an admin can rename one or change its uses.")}
      {model.empty
        ? E.blank(model.empty)
        : model.rows.map((row) => (
          <Fragment key={row.key}>
            {E.row(row.title, row.detail, E.act(rowActionLabel, "primary", linkRows ? row.href : undefined))}
          </Fragment>
        ))}
      {footer !== undefined ? footer : <LocationsInventoryLink />}
    </>
  );
}
