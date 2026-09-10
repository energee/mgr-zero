// components/mgr/views/driver-route.tsx — Driver route (departed run). Live
// slots Resume hrefs and ReturnRoute; inventory draws unlabeled Resume.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { DriverRouteViewModel } from "@/lib/mgr/driver-route-view";

export type { DriverRouteViewModel };

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
      {E.back(model.backTo ?? "Routes", model.title, undefined, model.backHref)}
      {E.fld("Driver · vehicle", model.driverVehicle)}
      {E.fld("Departed", model.departed)}
      {model.stops.map((row) => (
        <Fragment key={row.key}>
          {E.row(
            row.title,
            row.detail,
            row.verb ? E.act(row.verb, "info", linkRows ? row.href : undefined) : (row.trailing ?? (row.ok ? "done" : "")),
            row.warning ? "w" : row.ok ? "ok" : "",
          )}
        </Fragment>
      ))}
      {E.sp()}
      {action !== undefined ? action : E.btn("Return route")}
    </>
  );
}
