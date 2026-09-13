// components/mgr/views/licenses.tsx — the brewery's state licenses. Live
// slots LicenseForm per row and as the add sheet.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { rowAction } from "@/components/mgr/views/registry-fields";
import type { LicensesViewModel } from "@/lib/mgr/licenses-view";

export type { LicensesViewModel };

export function LicensesView({
  model,
  actions = {},
  addLicenses,
}: {
  model: LicensesViewModel;
  actions?: Record<string, ReactNode>;
  addLicenses?: ReactNode;
}) {
  return (
    <>
      {E.back("Compliance months", "Licenses", undefined, model.backHref)}
      {model.licenses.map((row) => (
        <Fragment key={row.key}>
          {E.row(row.title, row.detail, rowAction(row, actions))}
        </Fragment>
      ))}
      {model.licenses.length === 0 && E.blank("No licenses yet")}
      {addLicenses !== undefined ? addLicenses : E.btn("Add license", "g")}
      {E.note(model.note)}
    </>
  );
}
