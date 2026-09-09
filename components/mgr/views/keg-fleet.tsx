// components/mgr/views/keg-fleet.tsx — Keg fleet. Live slots PoolForm,
// KegEventForm, and customer/history navs; inventory draws the selected pool
// and return-empty preview.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { KegFleetViewModel } from "@/lib/mgr/keg-fleet-view";

export type { KegFleetViewModel };

export function KegFleetView({
  model,
  createAction,
  list,
  navs,
  eventForm,
  note,
}: {
  model: KegFleetViewModel;
  createAction?: ReactNode;
  list?: ReactNode;
  navs?: ReactNode;
  eventForm?: ReactNode;
  note?: ReactNode;
}) {
  return (
    <>
      {E.back("Beer", "Keg fleet", createAction, model.backHref)}
      {list ?? (
        <>
          {E.fld("Selected pool", model.pool ?? "")}
          {E.pick("Kind", model.kind ?? "", model.kindOptions ?? [])}
          {E.fld("Vendor", model.vendor ?? "")}
          {E.edit("Per-fill cost", model.perFill ?? "")}
          {E.btns([["Add keg pool", "g"], ["Save keg pool", "g"]])}
          {(model.bins ?? []).map((row) => (
            <Fragment key={row.key}>{E.row(row.title, row.detail, row.qty)}</Fragment>
          ))}
        </>
      )}
      {navs ?? (
        <>
          {E.nav("Customer keg balance", model.customerBalance ?? "")}
          {E.nav("Keg report", model.report ?? "")}
          {E.nav("Keg event history", model.history ?? "")}
        </>
      )}
      {eventForm ?? (
        <>
          {E.chips(model.eventKinds ?? [], model.eventKindIndex ?? 0)}
          {E.pick("Customer", model.customer ?? "", model.customerOptions ?? [])}
          {E.stq(model.qty ?? 0, "Kegs")}
          {E.info(<>Preview: +{model.qty ?? 0} returned · {model.previewName} {model.previewFrom} {E.arrow()} {model.previewTo} out</>)}
          {E.note("Empty kegs only; beer return/credit is Return shipment. The deposit refund is a separate credit memo.")}
          {E.btn("Record keg return", "irr")}
        </>
      )}
      {note}
    </>
  );
}
