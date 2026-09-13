// components/mgr/views/keg-fleet.tsx — shared fleet rows and navigation;
// live supplies only pool and event command forms.
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { KegFleetViewModel } from "@/lib/mgr/keg-fleet-view";

export type { KegFleetViewModel };

export function KegFleetView({
  model,
  createAction,
  poolActions,
  eventForm,
  note,
}: {
  model: KegFleetViewModel;
  createAction?: ReactNode;
  poolActions?: Record<string, ReactNode>;
  eventForm?: ReactNode;
  note?: ReactNode;
}) {
  return (
    <>
      {E.back("Beer", "Keg fleet", createAction, model.backHref)}
      {model.pools ? (model.pools.length ? model.pools.map((pool) => <div key={pool.key}>
        {E.row(pool.title, pool.detail, poolActions?.[pool.key])}
        {pool.bins.map((row) => <div key={row.key}>{E.row(row.title, row.detail, row.qty)}</div>)}
      </div>) : E.blank(model.empty)) : (
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
      {model.navRows ? model.navRows.map((row) => <Link key={row.key} href={row.href}>{E.nav(row.title, row.detail)}</Link>) : (
        <>
          {E.nav("Customer keg balance", model.customerBalance ?? "")}
          {E.nav("Keg report", model.report ?? "")}
          {E.nav("Keg event history", model.history ?? "")}
        </>
      )}
      {eventForm !== undefined ? eventForm : (
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
