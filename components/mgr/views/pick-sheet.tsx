// components/mgr/views/pick-sheet.tsx — Work → Pick sheet. Live passes
// PrintButton as printAction and filters={null}; inventory passes weekday
// chips from the fixture. Rows and totals come from the adapter.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { PickSheetViewModel } from "@/lib/mgr/pick-sheet-view";

export type { PickSheetViewModel };

export function PickSheetView({
  model,
  printAction,
  filters,
  linkRows,
  backHref,
}: {
  model: PickSheetViewModel;
  printAction?: ReactNode;
  /** Inventory weekday chips. Live passes `null`. */
  filters?: ReactNode;
  /** Live list: the verb is the order link. Inventory leaves taps unlabeled. */
  linkRows?: boolean;
  backHref?: string;
}) {
  return (
    <>
      {E.back("Work", "Pick sheet", printAction, backHref)}
      {filters}
      {model.empty
        ? E.blank(model.empty)
        : model.groups.map((group) => (
          <Fragment key={group.key}>
            {E.ttl(group.title)}
            {group.rows.map((row) => (
              <Fragment key={row.key}>
                {E.row(row.title, row.detail, E.act(row.verb, "info", linkRows ? row.href : undefined))}
              </Fragment>
            ))}
            {E.row("Totals", group.totals)}
          </Fragment>
        ))}
    </>
  );
}
