// components/mgr/views/pick-sheet.tsx — Work → Pick sheet. Live passes
// PrintButton as printAction and its own filters (or null to hide chips);
// inventory uses the weekday chips. Rows and totals come from the adapter.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { PickSheetViewModel } from "@/lib/mgr/pick-sheet-view";

export type { PickSheetViewModel };

const DATE_CHIPS = ["Wed 9/2", "Thu 9/3", "Fri 9/4"];

export function PickSheetView({
  model,
  printAction,
  filters,
  linkRows,
  backHref,
}: {
  model: PickSheetViewModel;
  printAction?: ReactNode;
  /** Omit for the inventory chips. Pass `null` on the live page, which has none. */
  filters?: ReactNode;
  /** Live list: the whole row is the order link. Inventory leaves taps unlabeled. */
  linkRows?: boolean;
  backHref?: string;
}) {
  return (
    <>
      {E.back("Work", "Pick sheet", printAction, backHref)}
      {filters !== undefined ? filters : E.chips(DATE_CHIPS, 1)}
      {model.empty
        ? E.blank(model.empty)
        : model.groups.map((group) => (
          <Fragment key={group.key}>
            {E.ttl(group.title)}
            {group.rows.map((row) => (
              <Fragment key={row.key}>
                {E.nav(row.title, row.detail, "", undefined, linkRows ? row.href : undefined)}
              </Fragment>
            ))}
            {E.row("Totals", group.totals)}
          </Fragment>
        ))}
    </>
  );
}
