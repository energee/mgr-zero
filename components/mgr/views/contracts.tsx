// components/mgr/views/contracts.tsx — Contracts list shared by inventory and live vendors.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { ContractsViewModel } from "@/lib/mgr/contracts-view";

export type { ContractsViewModel };

export function ContractsView({
  model,
  header,
  createAction,
  rowTrailing,
}: {
  model: ContractsViewModel;
  /** Live: the Vendors page mounts this as a section and heads it, so the
   * standalone back crumb would link the page to itself (#261). */
  header?: ReactNode;
  createAction?: ReactNode;
  rowTrailing?: (row: ContractsViewModel["rows"][number]) => ReactNode;
}) {
  return (
    <>
      {header ?? E.back("Vendors", "Contracts", createAction !== undefined ? createAction : E.btn("Add contract"), model.backHref)}
      {model.empty
        ? E.blank(model.empty)
        : model.rows.map((row) => (
          <Fragment key={row.key}>
            {E.row(row.title, row.detail, rowTrailing?.(row) ?? E.act(row.verb), row.warning ? "w" : "")}
          </Fragment>
        ))}
    </>
  );
}
