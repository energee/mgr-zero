// components/mgr/views/pick-sheet.tsx — Work → Pick sheet. Live passes
// PrintButton as printAction and its own filters (or null to hide chips);
// inventory uses the weekday chips. Rows and totals come from the adapter;
// Totals is the Pick table (Format · Product · Qty, the format named once).
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { startsGroup } from "@/lib/mgr/brand-lines";
import type { PickSheetViewModel } from "@/lib/mgr/pick-sheet-view";
import { WORK_CHIPS, WORK_TABS } from "@/lib/mgr/work-view";
import { WorkKindTabs } from "@/components/mgr/views/work-kind-tabs";

export type { PickSheetViewModel };

const DATE_CHIPS = ["Wed 9/2", "Thu 9/3", "Fri 9/4"];

export function PickSheetView({
  model,
  printAction,
  filters,
  linkRows,
  backHref,
  workHrefs,
}: {
  model: PickSheetViewModel;
  printAction?: ReactNode;
  /** Omit for the inventory chips. Pass `null` on the live page, which has none. */
  filters?: ReactNode;
  /** Live list: the whole row is the order link. Inventory leaves taps unlabeled. */
  linkRows?: boolean;
  backHref?: string;
  workHrefs?: Record<string, string>;
}) {
  return (
    <>
      {E.back("Work", "Pick", printAction, backHref)}
      <WorkKindTabs chips={WORK_CHIPS} current="pick" tabs={WORK_TABS} hrefs={workHrefs} />
      {filters !== undefined ? filters : E.chips(DATE_CHIPS, 1)}
      {model.empty
        ? E.blank(model.empty)
        : model.groups.map((group) => (
          <Fragment key={group.key}>
            {E.group(group.title)}
            {group.rows.map((row) => (
              <Fragment key={row.key}>
                {row.verb
                  ? E.row(row.title, row.detail, <>{row.changedAfterPick ? E.status("changed after pick", "w") : null}{E.act(row.verb, "primary", linkRows ? row.href : undefined)}</>)
                  : E.nav(row.title, row.detail, "", undefined, linkRows ? row.href : undefined)}
              </Fragment>
            ))}
            {E.ttl("Totals")}
            {E.tbl(["Format", "Product", "Qty"], group.totals.map((t, i) => [startsGroup(group.totals, i) ? E.brand(t.group) : "", t.name, t.qty]), ["l", "l", "r"], { sortable: false, dense: true })}
          </Fragment>
        ))}
    </>
  );
}
