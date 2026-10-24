// lib/mgr/beer-view.ts — view-model for the Beer landing (get_beer_overview).
import { plural } from "@/lib/mgr/plural";

export type BeerNavView = { key: string; title: string; detail: string; href?: string };

export type BeerViewModel = {
  navs: BeerNavView[];
  stock?: { key: string; title: string; detail: string; qty: string }[];
  stockEmpty?: string;
};

export type BeerOverview = {
  fgShortages: number;
  taproomBelowPar: number;
  /** Open tap intervals: kegs on tap now, guest kegs included. */
  openTaps: number;
  /** Open vessel occupancies: one per tank holding beer. */
  openOccupancies: number;
  materialShortages: number;
  kegsOut: number;
};

/** The live page and the inventory fixture both pass get_beer_overview's counts. */
export type BeerSnapshot = {
  overview: BeerOverview;
  showTaproom?: boolean;
};

export function toBeerViewProps(s: BeerSnapshot): BeerViewModel {
  const o = s.overview;
  const navs: BeerNavView[] = [
    { key: "fg", title: "Finished goods", detail: `${plural(o.fgShortages, "shortage")} · ATP by SKU`, href: "/inventory" },
  ];
  if (s.showTaproom) {
    navs.push(
      { key: "taproom", title: "Taproom", detail: `${plural(o.taproomBelowPar, "SKU")} below par · weekly count`, href: "/taproom" },
      { key: "taps", title: "Taps", detail: `${plural(o.openTaps, "keg")} on tap`, href: "/taproom/board" },
    );
  }
  navs.push(
    { key: "cellar", title: "Cellar", detail: `${plural(o.openOccupancies, "tank")} in use`, href: "/cellar" },
    // On a phone this row is the only way into Materials on hand, so it stays.
    { key: "materials", title: "Materials", detail: "Stock on hand · material definitions · cycle counts", href: "/materials" },
    // The count is material_requirements rows short > 0, the rows Planning lists (#989).
    { key: "shortages", title: "Shortages", detail: plural(o.materialShortages, "shortage"), href: "/planning" },
    { key: "kegs", title: "Kegs", detail: `${plural(o.kegsOut, "keg")} at customers`, href: "/kegs" },
  );
  return { navs };
}

export function taproomBeerView(stock: { skuId: string; locationId: string; sku: string; location: string; qty: number }[]): BeerViewModel {
  return {
    navs: [
      { key: "count", title: "Weekly count", detail: "record physical stock and review expected consumption", href: "/taproom" },
      { key: "board", title: "Tap board", detail: "open, swap, and kick kegs", href: "/taproom/board" },
      { key: "variance", title: "Variance by brand", detail: "compare completed count periods", href: "/taproom/variance" },
    ],
    stock: stock.map(row => ({ key: `${row.skuId}:${row.locationId}`, title: row.sku, detail: row.location, qty: String(row.qty) })),
    stockEmpty: "No taproom stock recorded",
  };
}
