// app/(app)/beer/page.tsx — the Beer landing: one row per area with the count
// that area has to say for itself (get_beer_overview), each opening its
// dedicated page. Taproom staff see taproom-location stock plus the live weekly
// count, tap board, and brand variance pages.
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";

type Overview = { fgShortages: number; taproomBelowPar: number; openTaps: number; openOccupancies: number; materialShortages: number; kegsOut: number };
import { plural } from "@/lib/mgr/plural";

export default async function BeerPage() {
  const brewery = await getActiveBrewery();
  const o = (await runCommand("get_beer_overview", {}, await buildContext(brewery.id))) as Overview | { taproomStock: { skuId: string; locationId: string; sku: string; location: string; qty: number }[] };
  if ("taproomStock" in o) return <>
    {E.hd("Beer")}
    {E.nav("Weekly count", "record physical stock and review expected consumption", "", undefined, "/taproom")}
    {E.nav("Tap board", "open, swap, and kick kegs", "", undefined, "/taproom/board")}
    {E.nav("Variance by brand", "compare completed count periods", "", undefined, "/taproom/variance")}
    <section id="taproom">
      <h2 className="text-lg font-semibold">Taproom stock</h2>
      {o.taproomStock.length ? o.taproomStock.map(s => (
        <div key={`${s.skuId}:${s.locationId}`}>{E.row(s.sku, s.location, String(s.qty))}</div>
      )) : E.blank("No taproom stock recorded")}
    </section>
  </>;
  return (
    <>
      {E.hd("Beer")}
      {E.nav("Finished goods", `${plural(o.fgShortages, "shortage")} · ATP by SKU`, "", undefined, "/inventory")}
      {(brewery.role === "admin" || brewery.role === "warehouse") && E.nav("Taproom", `${plural(o.taproomBelowPar, "SKU")} below par · weekly count`, "", undefined, "/taproom")}
      {(brewery.role === "admin" || brewery.role === "warehouse") && E.nav("Taps", `${plural(o.openTaps, "keg")} open · Tap board`, "", undefined, "/taproom/board")}
      {E.nav("Cellar", `${plural(o.openOccupancies, "tank")} with beer`, "", undefined, "/cellar")}
      {E.nav("Materials", plural(o.materialShortages, "shortage"), "", undefined, "/materials")}
      {E.nav("Kegs", `${o.kegsOut} out at customers`, "", undefined, "/kegs")}
      {E.blank("Each summary opens its dedicated area; this page does not expand indefinitely.")}
    </>
  );
}
