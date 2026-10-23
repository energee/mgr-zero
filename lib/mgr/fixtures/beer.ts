// lib/mgr/fixtures/beer.ts — get_beer_overview snapshot for the Beer landing,
// printed through toBeerViewProps exactly as the live page prints its counts.
import type { BeerSnapshot } from "@/lib/mgr/beer-view";

export const beerOverview: BeerSnapshot = {
  overview: { fgShortages: 2, taproomBelowPar: 2, openTaps: 11, openOccupancies: 6, materialShortages: 3, kegsOut: 142 },
  showTaproom: true,
};
