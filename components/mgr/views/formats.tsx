// components/mgr/views/formats.tsx — Formats table. Live Catalog slots this
// beside brands rather than folding Formats into CatalogView.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { FormatsViewModel } from "@/lib/mgr/formats-view";

export type { FormatsViewModel };

export function FormatsView({
  model,
  createAction,
  header,
  footer,
}: {
  model: FormatsViewModel;
  createAction?: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <>
      {header ?? E.back("Settings", "Formats", createAction !== undefined ? createAction : E.btn("Add format"), model.backHref)}
      {model.empty ? E.blank(model.empty) : E.tbl(
        [...model.headers, ""],
        model.rows.map((row) => [...row.cells, E.act("Open format", "primary", row.href)]),
      )}
      {footer}
    </>
  );
}
