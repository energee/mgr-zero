// lib/mgr/beer-view.ts — view-model for the Beer landing (get_beer_overview).
import { plural } from "@/lib/mgr/plural";

export type BeerNavView = { key: string; title: string; detail: string; href?: string };

export type BeerViewModel = {
  navs: BeerNavView[];
  blank: string;
};

export type BeerOverview = {
  fgShortages: number;
  taproomBelowPar: number;
  openTaps: number;
  openOccupancies: number;
  materialShortages: number;
  kegsOut: number;
};

export type BeerSnapshot = BeerViewModel | {
  overview: BeerOverview;
  showTaproom?: boolean;
};

const BLANK = "Each summary opens its dedicated area; this page does not expand indefinitely.";

export function toBeerViewProps(s: BeerSnapshot): BeerViewModel {
  if ("navs" in s) return { navs: s.navs, blank: s.blank };
  const o = s.overview;
  const navs: BeerNavView[] = [
    { key: "fg", title: "Finished goods", detail: `${plural(o.fgShortages, "shortage")} · ATP by SKU`, href: "/inventory" },
  ];
  if (s.showTaproom) {
    navs.push(
      { key: "taproom", title: "Taproom", detail: `${plural(o.taproomBelowPar, "SKU")} below par · weekly count`, href: "/taproom" },
      { key: "taps", title: "Taps", detail: `${plural(o.openTaps, "keg")} open · Tap board`, href: "/taproom/board" },
    );
  }
  navs.push(
    { key: "cellar", title: "Cellar", detail: `${plural(o.openOccupancies, "tank")} with beer`, href: "/cellar" },
    { key: "materials", title: "Materials", detail: plural(o.materialShortages, "shortage"), href: "/materials" },
    { key: "kegs", title: "Kegs", detail: `${o.kegsOut} out at customers`, href: "/kegs" },
  );
  return { navs, blank: BLANK };
}
