import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { CellarMapViewModel } from "@/lib/mgr/cellar-map-view";

export function CellarMapView({ model, transfer, complete }: { model: CellarMapViewModel; transfer?: ReactNode; complete?: ReactNode }) {
  return <>
    {E.back("Beer", "Cellar", E.btn("Add vessel", "g", model.addHref), model.backHref)}
    {model.tiles.length ? E.tiles(model.tiles.map(tile => [tile.name, tile.detail, tile.reading, tile.warning ? 1 : 0, tile.fill, tile.href]), "c2") : E.blank("No vessels yet")}
    <div className="grid grid-cols-3 gap-2">
      {E.btn("Reading", model.readingHref === null ? "p disabled" : "p", model.readingHref ?? undefined)}
      {transfer !== undefined ? transfer : E.btn("Transfer", "g")}
      {E.btn("Brew day", "g", model.brewHref)}
    </div>
    {model.detail && E.nav(model.detail.title, model.detail.description, "", undefined, model.detail.href)}
    {complete !== undefined ? complete : E.btn("Complete batch", "g")}
    {E.sp()}
  </>;
}
