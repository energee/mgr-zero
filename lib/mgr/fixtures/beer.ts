// lib/mgr/fixtures/beer.ts — get_beer_overview snapshot for the Beer landing.
import type { BeerViewModel } from "@/lib/mgr/beer-view";

export const beerOverview: BeerViewModel = {
  navs: [
    { key: "fg", title: "Finished goods", detail: "2 shortages · ATP by SKU", href: "/inventory" },
    { key: "taproom", title: "Taproom", detail: "2 below par · weekly count due", href: "/taproom" },
    { key: "taps", title: "Taps", detail: "11 open · Tap board", href: "/taproom/board" },
    { key: "cellar", title: "Cellar", detail: "6 vessels · 1 reading overdue", href: "/cellar" },
    { key: "materials", title: "Materials", detail: "3 shortages", href: "/materials" },
    { key: "kegs", title: "Kegs", detail: "142 out · 9 overdue", href: "/kegs" },
  ],
  blank: "Each summary opens its dedicated area; this page does not expand indefinitely.",
};
