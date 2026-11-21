// components/mgr/views/cellar-map.tsx — Beer › Cellar: the in-place actions
// (Reading, Transfer, Addition, Complete batch), the note saying why any are
// off, then one section per vessel type. Its heading counts the tanks in use.
// Each tank holding beer is a tile whose last line is its ABV and one link to
// Reading on that tank: Add reading, or ✓ Today once it was read today; the section's
// empty tanks are one line of links under the tiles. Tiles / Rows switches the
// tanks holding beer between tiles and one list row each; both show the same
// facts and actions. CellarLayout saves the choice, and model.layout is the
// saved one. With beer in several tanks the top Reading is Start readings: it
// opens the first tank still to read, and the sheet's Save and next tank walks
// the rest.
// Brew day is not a cellar action: it starts from Batches, so the map draws it
// as a link there, at the foot (#1115).
import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { rowLinkPrefetch } from "@/lib/mgr/row-link-prefetch";
import { cn } from "@/lib/utils";
import { E, ROW_LINK_COVER, TOUCH_HIT } from "@/components/mgr/e";
import { CellarLayout } from "@/components/mgr/cellar-layout";
import type { CellarMapViewModel } from "@/lib/mgr/cellar-map-view";

type Tile = CellarMapViewModel["tiles"][number];

/** A tank's reading link, one quiet word on the ABV line: Add reading, or a muted ✓ Today once it has today's reading. Either opens Reading, so a second reading stays one tap away. `linkClassName` styles the link; without it (a tile) the word gets a 48px tap area. */
const readingLink = (tile: Tile, linkClassName?: string): ReactNode => {
  const label = tile.readToday
    ? <><span aria-hidden="true">✓ </span>Today<span className="sr-only">: read. Add another reading for {tile.name}</span></>
    : <>Add reading<span className="sr-only"> for {tile.name}</span></>;
  const className = cn("whitespace-nowrap text-sm", tile.readToday ? "text-muted-foreground" : "text-primary", linkClassName ?? TOUCH_HIT);
  return tile.readingHref
    ? <Link href={tile.readingHref} prefetch={rowLinkPrefetch(tile.readingHref)} data-tap data-to="Fermentation reading" className={className}>{label}</Link>
    : <span className={className}>{label}</span>;
};

/** A tile's last line: its ABV so far, then its reading actions when the tile has a path to Reading. */
function tileReading(tile: Tile): ReactNode {
  return tile.readingHref === undefined ? E.polite(tile.reading) : <div className="flex w-full flex-wrap items-center justify-between gap-x-2 gap-y-1">
    {E.polite(tile.reading)}
    {readingLink(tile)}
  </div>;
}

/** A link to the tank's Vessel detail. */
const vesselLink = (tile: Tile, text: ReactNode, className?: string): ReactNode =>
  <Link key={tile.name} href={tile.href ?? "#"} prefetch={tile.href ? rowLinkPrefetch(tile.href) : false} data-to="Vessel detail" className={className}>{text}</Link>;

/** A tile's first line: the tank, then its beer, quieter. */
const tileName = (tile: Tile): ReactNode => <>{tile.name}{" "}<span className="font-normal text-muted-foreground">{tile.detail}</span></>;

/** A tank as a list row: the same facts and reading actions as its tile, on one or two lines. Add reading covers the row, so a tap anywhere on it opens Reading; the tank's name sits above that cover and still opens Vessel detail. */
const tankRow = (tile: Tile): ReactNode => <Fragment key={tile.name}>{E.row(
  <>{vesselLink(tile, tile.name, "relative z-10")}{" "}<span className="font-normal text-muted-foreground">{tile.detail}</span></>,
  [tile.day, tile.volume, tile.reading].filter(Boolean).join(" · "),
  tile.readingHref === undefined ? "" : readingLink(tile, ROW_LINK_COVER),
)}</Fragment>;

/** One section per vessel type: its tanks holding beer as tiles or as list rows, then its Empty line. */
function groupSections(tiles: Tile[], asRows: boolean): ReactNode {
  return [...new Set(tiles.map(tile => tile.group))].map(group => {
    const inGroup = tiles.filter(tile => tile.group === group);
    const full = inGroup.filter(tile => tile.volume !== undefined);
    const empty = inGroup.filter(tile => tile.volume === undefined);
    return <Fragment key={group}>
      {E.group(`${group} · ${full.length} of ${inGroup.length} in use`)}
      {full.length > 0 && (asRows
        ? <div>{full.map(tankRow)}</div>
        : E.tiles(full.map(tile => [tileName(tile), [tile.day, tile.volume].filter(Boolean).join(" · "), undefined, tile.warning ? 1 : 0, tile.fill, tile.href, tileReading(tile)]), true))}
      {empty.length > 0 && <p className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
        <span>Empty</span>{empty.map(tile => vesselLink(tile, `${tile.name} · ${tile.detail}`, "underline"))}
      </p>}
    </Fragment>;
  });
}

export function CellarMapView({ model, transfer, addition, complete }: { model: CellarMapViewModel; transfer?: ReactNode; addition?: ReactNode; complete?: ReactNode }) {
  const hasVessels = model.tiles.length > 0;
  // One tank holding beer: Reading is that tank's. Several: it starts the round. With no path supplied it is drawn unlinked.
  const readingLabel = model.tiles.filter(tile => tile.volume !== undefined).length > 1 ? "Start readings" : "Reading";
  return <>
    {E.back("Beer", "Cellar", undefined, model.backHref)}
    {/* On a phone the actions share each row's width, so a wrapped one fills its row. */}
    <div className="flex flex-wrap gap-2 *:flex-1 md:justify-end md:*:flex-none">
      {E.btn(readingLabel, model.actionsOff ? "p disabled" : "p", model.readingHref ?? undefined)}
      {transfer !== undefined ? transfer : E.btn("Transfer", model.actionsOff ? "g disabled" : "g")}
      {addition !== undefined ? addition : E.btn("Addition", model.actionsOff ? "g disabled" : "g")}
      {complete !== undefined ? complete : E.btn("Complete batch", "g")}
    </div>
    {model.actionHint && E.info(model.actionHint)}
    {model.detail && E.nav(model.detail.title, model.detail.description, "", undefined, model.detail.href)}
    {hasVessels
      ? <CellarLayout initial={model.layout} tiles={groupSections(model.tiles, false)} rows={groupSections(model.tiles, true)} />
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
