// components/mgr/views/return-route.tsx — Return route (all stops delivered).
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { ReturnRouteViewModel } from "@/lib/mgr/return-route-view";

export function ReturnRouteView({
  model,
  action,
}: {
  model: ReturnRouteViewModel;
  action?: ReactNode;
}) {
  return (
    <>
      {E.back("Deliveries", model.title, undefined, model.backHref, "Routes")}
      {E.fld("Driver · vehicle", model.driverVehicle)}
      {E.fld("Departed", model.departed)}
      {model.stops.map((row) => (
        <Fragment key={row.key}>{E.row(row.title, row.outstanding ? `${row.detail} · ${row.outstanding} awaiting check-in` : row.detail, row.outstanding ? E.act("Check in", "attention", row.returnHref) : "Done", row.outstanding ? "w" : "ok")}</Fragment>
      ))}
      {E.sp()}
      {action !== undefined ? action : E.btn("Return route")}
    </>
  );
}
