// components/mgr/views/vessel-detail.tsx — Vessel detail inventory drawing.
// Live cellar is the occupancy list (Cellar map), not this record.
import { Fragment } from "react";
import { E } from "@/components/mgr/e";
import type { VesselDetailViewModel } from "@/lib/mgr/vessel-detail-view";

export type { VesselDetailViewModel };

export function VesselDetailView({ model }: { model: VesselDetailViewModel }) {
  return (
    <>
      {E.back("Cellar map", model.title, undefined, model.backHref)}
      {E.row(model.occupancy.title, model.occupancy.detail, E.act(model.occupancy.verb), model.occupancy.warning ? "w" : "")}
      {E.fld("Current reading", model.currentReading)}
      {E.ttl("Reading history")}
      {model.history.map((row) => (
        <Fragment key={row.key}>{E.row(row.title, row.detail, row.who)}</Fragment>
      ))}
      {E.ttl("Vessel facts")}
      {E.edit("Name", model.name)}
      {E.pick("Type", model.type, model.typeOptions)}
      {E.edit("Capacity", model.capacity)}
      {E.btn("Save vessel")}
    </>
  );
}
