// components/mgr/views/today.tsx — Today and persona landings. Live maps
// get_today / taproomTodayRows onto rows with linkRows; inventory uses fixtures.
import { Fragment, type ReactNode } from "react";
import { BeerIcon, DeliveryTruck01Icon, Invoice01Icon, Package01Icon, Route01Icon, TaskDone01Icon, ThermometerIcon } from "@hugeicons/core-free-icons";
import { E } from "@/components/mgr/e";
import type { TodayIcon, TodayViewModel } from "@/lib/mgr/today-view";

export type { TodayViewModel };

const ICON: Record<TodayIcon, typeof Package01Icon> = {
  package: Package01Icon, truck: DeliveryTruck01Icon, route: Route01Icon,
  thermo: ThermometerIcon, beer: BeerIcon, task: TaskDone01Icon, invoice: Invoice01Icon,
};

export function TodayView({
  model,
  lead,
  footer,
  emptyAction,
  linkRows,
}: {
  model: TodayViewModel;
  lead?: ReactNode;
  footer?: ReactNode;
  emptyAction?: ReactNode;
  linkRows?: boolean;
}) {
  return (
    <>
      {E.hd("Today", model.date)}
      {lead}
      {model.empty
        ? (
          <>
            {E.blank(model.empty)}
            {emptyAction !== undefined ? emptyAction : (model.emptyVerb ? E.btn(model.emptyVerb, "g") : null)}
          </>
        )
        : model.rows.map((row) => (
          <Fragment key={row.key}>
            {E.row(
              row.title,
              row.detail,
              row.verb
                ? E.act(row.verb, row.tone ?? "primary", linkRows ? row.href : undefined)
                : (row.trailing ?? ""),
              row.warning ? "w" : "",
              row.icon ? ICON[row.icon] : undefined,
            )}
          </Fragment>
        ))}
      {footer}
    </>
  );
}
