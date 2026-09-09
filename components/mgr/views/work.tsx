// components/mgr/views/work.tsx — Work landing. Live slots WorkList as list
// (chips + rows are client-filtered); inventory draws Work chips and rows.
import { Fragment, type ReactNode } from "react";
import { DeliveryTruck01Icon, Package01Icon, Route01Icon } from "@hugeicons/core-free-icons";
import { E } from "@/components/mgr/e";
import type { WorkViewModel } from "@/lib/mgr/work-view";

export type { WorkViewModel };

const ICON = { package: Package01Icon, truck: DeliveryTruck01Icon, route: Route01Icon };

export function WorkView({
  model,
  createAction,
  list,
  linkRows,
}: {
  model: WorkViewModel;
  createAction?: ReactNode;
  /** Live: WorkList. Inventory draws tabs + rows when omitted. */
  list?: ReactNode;
  linkRows?: boolean;
}) {
  return (
    <>
      {E.hd("Work", model.subtitle, createAction !== undefined ? createAction : E.btn("New order", "g"))}
      {list !== undefined
        ? list
        : (
          <>
            {E.tabs(model.workChips, model.workChipIndex, "w-full", model.workTabs)}
            {model.rows.map((row) => (
              <Fragment key={row.key}>
                {E.row(row.title, row.detail, E.act(row.verb, row.tone, linkRows ? row.href : undefined), row.warning ? "w" : "", row.icon ? ICON[row.icon] : undefined)}
              </Fragment>
            ))}
          </>
        )}
    </>
  );
}
