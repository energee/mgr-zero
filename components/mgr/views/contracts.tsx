// components/mgr/views/contracts.tsx — Contracts list shared by inventory, the
// live Vendors page and one vendor's page, whose rows carry no verb (#1586).
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { ContractsViewModel } from "@/lib/mgr/contracts-view";

export function ContractsView({
  model,
  header,
  rowTrailing,
}: {
  model: ContractsViewModel;
  /** Live: the Vendors page mounts this as a section and heads it, so the
   * standalone back crumb would link the page to itself (#261). */
  header?: ReactNode;
  rowTrailing?: (row: ContractsViewModel["rows"][number]) => ReactNode;
}) {
  return (
    <>
      {header ?? E.back("Vendors", "Contracts", E.btn("Add contract"), model.backHref)}
      {model.empty
        ? E.blank(model.empty)
        : model.rows.map((row) => (
          <Fragment key={row.key}>
            {E.row(row.title, row.detail, rowTrailing?.(row) ?? (row.verb ? E.act(row.verb) : null), row.warning ? "w" : "")}
          </Fragment>
        ))}
    </>
  );
}
