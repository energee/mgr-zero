// components/mgr/views/cellar-map.tsx — Beer › Cellar: the in-place actions
// (Reading, Transfer, Addition), the note saying why any are off, the vessel
// tiles, and Complete batch. Brew day is not a cellar action: it starts from
// Batches, so the map draws it as a link there (#1115).
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { CellarMapViewModel } from "@/lib/mgr/cellar-map-view";

export function CellarMapView({ model, transfer, addition, complete }: { model: CellarMapViewModel; transfer?: ReactNode; addition?: ReactNode; complete?: ReactNode }) {
  const hasVessels = model.tiles.length > 0;
  return <>
    {E.back("Beer", "Cellar", undefined, model.backHref)}
    <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:justify-end">
      {E.btn("Reading", model.actionsOff || model.readingHref === null ? "p disabled" : "p", model.readingHref ?? undefined)}
      {transfer !== undefined ? transfer : E.btn("Transfer", model.actionsOff ? "g disabled" : "g")}
      {addition !== undefined ? addition : E.btn("Addition", model.actionsOff ? "g disabled" : "g")}
    </div>
    {hasVessels && model.actionHint && E.info(model.actionHint)}
    {hasVessels && E.link("Start a brew day in Batches", "Batches", model.brewHref)}
    {model.detail && E.nav(model.detail.title, model.detail.description, "", undefined, model.detail.href)}
    {hasVessels
      ? E.tiles(model.tiles.map(tile => [tile.name, tile.detail, tile.reading, tile.warning ? 1 : 0, tile.fill, tile.href]), "c2")
      : E.blank(
        { title: "No vessels yet", description: "Add your tanks to start tracking the cellar." },
        undefined,
        model.addHref !== null && E.btn("Add vessel", "p", model.addHref),
      )}
    {complete !== undefined ? complete : E.btn("Complete batch", "g")}
    {hasVessels && model.addHref !== null && E.btn("Add vessel", "g", model.addHref)}
    {E.sp()}
  </>;
}
