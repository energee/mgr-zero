// components/mgr/views/formats.tsx — Formats desktop table and labeled phone list.
// Live Catalog slots this beside brands rather than folding it into CatalogView.
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
  const align: ("l" | "r")[] = ["l", "l", "r", "l", "l"];
  return (
    <>
      {header ?? E.back("Settings", "Formats", createAction !== undefined ? createAction : E.btn("Add format"), model.backHref)}
      {model.empty ? E.blank(model.empty) : <>
        <div className="hidden md:block">
          {E.tbl(
            [...model.headers, ""],
            model.rows.map((row) => [...row.cells, E.act("Open format", "primary", row.href)]),
            align,
          )}
        </div>
        <ul className="grid gap-3 md:hidden">
          {model.rows.map(row => <li key={row.key} className="min-w-0 rounded-lg border p-3">
            <div className="flex items-start justify-between gap-3">
              <h2 className="min-w-0 break-words font-medium">{row.cells[0]}</h2>
              {E.act("Open format", "primary", row.href)}
            </div>
            <dl className="mt-3 grid gap-2 text-sm">
              {row.cells.slice(1).map((cell, index) => <div key={index} className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3">
                <dt className="text-muted-foreground">{model.headers[index + 1]}</dt>
                <dd className={align[index + 1] === "r" ? "min-w-0 break-words text-right" : "min-w-0 break-words text-left"}>{cell}</dd>
              </div>)}
            </dl>
          </li>)}
        </ul>
      </>}
      {footer}
    </>
  );
}
