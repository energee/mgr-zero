// components/mgr/views/cellar-map.tsx — Beer › Cellar: the in-place actions
// (Reading, Transfer, Addition, Complete batch), the note saying why any are
// off, then vessel tiles grouped by vessel type. An occupied tile's reading
// line opens Reading on that tank, and a tank with no reading yet has an Add
// reading button there; an empty tank is drawn quiet.
// Brew day is not a cellar action: it starts from
// Batches, so the map draws it as a link there, at the foot (#1115).
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { CellarMapViewModel } from "@/lib/mgr/cellar-map-view";

/** A tile's last lines: its latest reading, linked to Reading when the tile has a path there, or Add reading when it has a path but no reading yet; under it, ABV so far and how long ago it was read, then Fermenting or Finished once two gravity readings show a trend. */
function tileReading(tile: CellarMapViewModel["tiles"][number]): ReactNode {
  if (tile.readingHref === undefined) return E.polite(tile.reading);
  const href = tile.readingHref || undefined;
  if (!tile.reading) return E.act("Add reading", "primary", href);
  return <span className="flex flex-col items-start gap-1">
    {E.link(tile.reading, "Fermentation reading", href)}
    <span className="text-xs text-muted-foreground">{[tile.abv, tile.readAgo].filter(Boolean).join(" · ")}</span>
    {tile.state && E.status(tile.state, tile.state === "Finished" ? "ok" : "")}
  </span>;
}

export function CellarMapView({ model, transfer, addition, complete }: { model: CellarMapViewModel; transfer?: ReactNode; addition?: ReactNode; complete?: ReactNode }) {
  const hasVessels = model.tiles.length > 0;
  const groups = [...new Set(model.tiles.map(tile => tile.group))];
  // Beer in several tanks (readingHref null) leaves the top Reading no single target, so it is not drawn.
  // With no path supplied (undefined) it is drawn unlinked.
  const topReading = model.actionsOff || model.readingHref !== null;
  return <>
    {E.back("Beer", "Cellar", undefined, model.backHref)}
    <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:justify-end">
      {topReading && E.btn("Reading", model.actionsOff ? "p disabled" : "p", model.readingHref ?? undefined)}
      {transfer !== undefined ? transfer : E.btn("Transfer", model.actionsOff ? "g disabled" : "g")}
      {addition !== undefined ? addition : E.btn("Addition", model.actionsOff ? "g disabled" : "g")}
      {complete !== undefined ? complete : E.btn("Complete batch", "g")}
    </div>
    {model.actionHint && E.info(model.actionHint)}
    {model.detail && E.nav(model.detail.title, model.detail.description, "", undefined, model.detail.href)}
    {hasVessels
      ? groups.map(group => <Fragment key={group}>
        {E.group(group)}
        {E.tiles(model.tiles.filter(tile => tile.group === group).map(tile => [tile.name, tile.detail, tile.volume, tile.warning ? 1 : 0, tile.fill, tile.href,
          tileReading(tile), tile.volume === undefined]))}
      </Fragment>)
      : E.blank(
        { title: "No vessels yet" },
        undefined,
        model.addHref !== null && E.btn("Add vessel", "p", model.addHref),
      )}
    {hasVessels && <div className="flex flex-wrap items-center justify-between gap-2">
      {E.link("Start a brew day in Batches", "Batches", model.brewHref)}
      {model.addHref !== null && E.btn("Add vessel", "g", model.addHref)}
    </div>}
    {E.sp()}
  </>;
}
