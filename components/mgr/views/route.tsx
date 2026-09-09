// components/mgr/views/route.tsx — Route builder. Live slots RouteForm;
// inventory draws date, driver, stops, Save and Depart.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { RouteViewModel } from "@/lib/mgr/route-view";

export type { RouteViewModel };

export function RouteView({
  model,
  form,
}: {
  model: RouteViewModel;
  form?: ReactNode;
}) {
  return (
    <>
      {E.back(model.backTo ?? "Routes", model.title, undefined, model.backHref)}
      {form ?? (
        <>
          {E.edit("Delivery date", model.date ?? "", "date")}
          {E.pick("Driver", model.driver ?? "", model.driverOptions ?? [])}
          {E.edit("Vehicle", model.vehicle ?? "")}
          {E.edit("Route name", model.name ?? "")}
          {E.ttl("Stops")}
          {(model.stops ?? []).map((row) => (
            <Fragment key={row.key}>
              {E.row(row.title, row.detail, row.trailing ?? "", row.warning ? "w" : "")}
            </Fragment>
          ))}
          {E.btns([["Save route plan", "g"], ["Depart route", "p"]])}
        </>
      )}
    </>
  );
}
