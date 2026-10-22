// components/mgr/views/cellar-map.tsx — Beer › Cellar: the in-place actions
// (Reading, Transfer, Addition), the note saying why any are off, the vessel
// tiles, and Complete batch. Brew day is not a cellar action: it starts from
// Batches, so the map draws it as a link there (#1115).
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { CellarMapViewModel } from "@/lib/mgr/cellar-map-view";

export function CellarMapView({ model, transfer, addition, complete }: { model: CellarMapViewModel; transfer?: ReactNode; addition?: ReactNode; complete?: ReactNode }) {
  return <>
    {E.back("Beer", "Cellar", undefined, model.backHref)}
    <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:justify-end">
      {E.btn("Reading", model.readingHref === null ? "p disabled" : "p", model.readingHref ?? undefined)}
      {transfer !== undefined ? transfer : E.btn("Transfer", "g")}
      {addition !== undefined ? addition : E.btn("Addition", "g")}
    </div>
    {model.actionHint && E.info(model.actionHint)}
    {E.link("Start a brew day in Batches", "Batches", model.brewHref)}
    {model.detail && E.nav(model.detail.title, model.detail.description, "", undefined, model.detail.href)}
    {model.tiles.length ? E.tiles(model.tiles.map(tile => [tile.name, tile.detail, tile.reading, tile.warning ? 1 : 0, tile.fill, tile.href]), "c2") : E.blank("No vessels yet")}
    {complete !== undefined ? complete : E.btn("Complete batch", "g")}
    {model.addHref !== null && E.btn("Add vessel", "g", model.addHref)}
    {E.sp()}
  </>;
}
