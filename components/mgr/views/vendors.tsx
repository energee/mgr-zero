// components/mgr/views/vendors.tsx — Vendors list. Live slots VendorForm rows
// and the contracts footer; inventory draws Edit and Materials / Contracts navs.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { VendorsRowView, VendorsViewModel } from "@/lib/mgr/vendors-view";

export type { VendorsViewModel };

export function VendorsView({
  model,
  header,
  createAction,
  rowTrailing,
  footer,
}: {
  model: VendorsViewModel;
  header?: ReactNode;
  createAction?: ReactNode;
  rowTrailing?: (row: VendorsRowView) => ReactNode;
  footer?: ReactNode;
}) {
  return (
    <>
      {header ?? E.back("More", "Vendors", createAction !== undefined ? createAction : E.btn("Add vendor"), model.backHref)}
      {model.empty
        ? E.blank(model.empty)
        : model.rows.map((row) => (
          <Fragment key={row.key}>
            {E.row(row.title, row.detail, rowTrailing ? rowTrailing(row) : E.act(row.verb), row.disabled ? "dis" : "")}
          </Fragment>
        ))}
      {footer ?? (
        <>
          {E.nav("Materials", model.materials)}
          {E.nav("Contracts", model.contracts)}
        </>
      )}
    </>
  );
}
