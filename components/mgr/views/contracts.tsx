// components/mgr/views/contracts.tsx — Contracts list (inventory). Live vendors
// page slots contracts under VendorsView.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { ContractsViewModel } from "@/lib/mgr/contracts-view";

export type { ContractsViewModel };

export function ContractsView({
  model,
  createAction,
}: {
  model: ContractsViewModel;
  createAction?: ReactNode;
}) {
  return (
    <>
      {E.back("Vendors", "Contracts", createAction !== undefined ? createAction : E.btn("Add contract"), model.backHref)}
      {model.empty
        ? E.blank(model.empty)
        : model.rows.map((row) => (
          <Fragment key={row.key}>
            {E.row(row.title, row.detail, E.act(row.verb), row.warning ? "w" : "")}
          </Fragment>
        ))}
    </>
  );
}
