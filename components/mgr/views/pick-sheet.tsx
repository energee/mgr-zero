// components/mgr/views/pick-sheet.tsx — Work → Pick sheet. Live passes
// PrintButton as printAction and its own filters (or null to hide chips);
// inventory uses the weekday chips. Rows and totals come from the adapter;
// Totals is the Pick table (Format · Product · Qty, the format named once).
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { startsGroup } from "@/lib/mgr/brand-lines";
import type { PickSheetViewModel } from "@/lib/mgr/pick-sheet-view";
import { navTitle } from "@/lib/mgr/nav";
import { WORK_CHIPS, WORK_TABS } from "@/lib/mgr/work-view";
import { WorkKindTabs } from "@/components/mgr/views/work-kind-tabs";
import { plural } from "@/lib/mgr/plural";

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
      {E.back("Work", navTitle("/pick"), printAction, backHref)}
      <WorkKindTabs chips={WORK_CHIPS} current="pick" tabs={WORK_TABS} hrefs={workHrefs} />
      <p className="text-sm text-muted-foreground">
        Stage beer by ship date, then open an order to record its pick.
      </p>
      {filters !== undefined ? filters : E.chips(DATE_CHIPS, 1)}
      {model.empty
        ? E.blank(model.empty)
        : model.groups.map((group) => (
          <section key={group.key} aria-label={group.title} className="mt-4 space-y-4 border-t pt-4 first-of-type:mt-0 first-of-type:border-t-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              {E.group(group.title)}
              <span className="text-sm text-muted-foreground">{plural(group.rows.length, "order")}</span>
            </div>
            <div className="grid gap-6 lg:grid-cols-2 print:grid-cols-1">
              <div className="min-w-0">
                <h3 className="text-sm font-medium">Orders</h3>
                {group.rows.map((row) => (
                  <Fragment key={row.key}>
                    {row.verb
                      ? E.row(
                        row.title,
                        row.detail,
                        E.act(row.verb, "primary", linkRows ? row.actionHref : undefined),
                        row.changedAfterPick ? "w" : "",
                        undefined,
                        row.changedAfterPick ? <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">{E.status("changed after pick", "w")}Count only the added or raised lines.</div> : undefined,
                      )
                      : E.nav(row.title, row.detail, "", undefined, linkRows ? row.href : undefined)}
                  </Fragment>
                ))}
              </div>
              <div className="min-w-0 self-start rounded-lg bg-muted/30 p-4 print:bg-transparent print:p-0">
                <h3 className="text-sm font-medium">Totals</h3>
                <p className="mb-3 mt-1 text-xs text-muted-foreground">All ordered quantities, including picked orders. Not quantities left to pick.</p>
                {E.tbl(["Format", "Product", "Qty"], group.totals.map((t, i) => [startsGroup(group.totals, i) ? E.brand(t.group) : "", t.name, t.qty]), ["l", "l", "r"], { sortable: false, dense: true })}
              </div>
            </div>
          </section>
        ))}
    </>
  );
}
