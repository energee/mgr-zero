// components/mgr/views/today.tsx — Today and persona landings. Live maps
// get_today / taproomTodayRows onto rows with linkRows; inventory uses fixtures.
// The role's quick actions (model.actions) sit under the header, above the rows.
import { Fragment, type ReactNode } from "react";
import { BeerIcon, DeliveryTruck01Icon, Invoice01Icon, Package01Icon, Route01Icon, TaskDone01Icon, ThermometerIcon } from "@hugeicons/core-free-icons";
import { E } from "@/components/mgr/e";
import type { TodayIcon, TodayViewModel } from "@/lib/mgr/today-view";

const ICON: Record<TodayIcon, typeof Package01Icon> = {
  package: Package01Icon, truck: DeliveryTruck01Icon, route: Route01Icon,
  thermo: ThermometerIcon, beer: BeerIcon, task: TaskDone01Icon, invoice: Invoice01Icon,
};

export function TodayView({
  model,
  footer,
  emptyAction,
  linkRows,
}: {
  model: TodayViewModel;
  footer?: ReactNode;
  emptyAction?: ReactNode;
  linkRows?: boolean;
}) {
  const actions = model.actions ?? [];
  return (
    <>
      {E.hd("Today", model.date)}
      {/* A lone action spans the phone column, as E.btn does; two or more share a grid. */}
      {actions.length === 1 && E.btn(actions[0].label, "g", actions[0].href)}
      {actions.length > 1 && E.btns(actions.map((a) => [a.label, "g", a.href]))}
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
