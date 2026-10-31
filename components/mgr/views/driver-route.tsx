// components/mgr/views/driver-route.tsx — Driver route (departed run). Live
// supplies stop-action hrefs and ReturnRoute; inventory keeps its actions inert.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { DriverRouteViewModel } from "@/lib/mgr/driver-route-view";

export function DriverRouteView({
  model,
  action,
  linkRows,
}: {
  model: DriverRouteViewModel;
  action?: ReactNode;
  linkRows?: boolean;
}) {
  return (
    <>
      {E.back("Deliveries", model.title, undefined, model.backHref, "Routes")}
      {E.fld("Driver · vehicle", model.driverVehicle)}
      {E.fld("Departed", model.departed)}
      {model.stops.map((row) => (
        <Fragment key={row.key}>
          {E.row(
            row.title,
            row.detail,
            row.verb ? E.act(row.verb, "info", linkRows ? row.href : undefined) : (row.trailing ?? (row.ok ? "Done" : "")),
            row.warning ? "w" : row.ok ? "ok" : "",
          )}
        </Fragment>
      ))}
      {E.sp()}
      {action !== undefined ? action : E.btn("Return route")}
    </>
  );
}
