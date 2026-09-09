// components/mgr/views/return-route.tsx — Return route (all stops delivered).
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { ReturnRouteViewModel } from "@/lib/mgr/return-route-view";

export type { ReturnRouteViewModel };

export function ReturnRouteView({
  model,
  action,
}: {
  model: ReturnRouteViewModel;
  action?: ReactNode;
}) {
  return (
    <>
      {E.back(model.backTo ?? "Routes", model.title, undefined, model.backHref)}
      {E.fld("Driver · vehicle", model.driverVehicle)}
      {E.fld("Departed", model.departed)}
      {model.stops.map((row) => (
        <Fragment key={row.key}>{E.row(row.title, row.detail, "done", "ok")}</Fragment>
      ))}
      {E.sp()}
      {action !== undefined ? action : E.btn("Return route")}
    </>
  );
}
