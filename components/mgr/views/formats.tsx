// components/mgr/views/formats.tsx — Formats desktop table and labeled phone list,
// drawn by the shared RecordTable; each format's name links to its page.
// Live Catalog slots this beside brands rather than folding it into CatalogView.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { RecordTable } from "@/components/mgr/views/record-table";
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
      {model.empty ? E.blank(model.empty) : <RecordTable headers={model.headers} align={["l", "l", "r", "l"]} rows={model.rows} />}
      {footer}
    </>
  );
}
