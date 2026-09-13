// app/(app)/beer/page.tsx — the Beer landing: one row per area with the count
// that area has to say for itself (get_beer_overview), each opening its
// dedicated page. Taproom staff see taproom-location stock plus the live weekly
// count, tap board, and brand variance pages.
import { BeerView } from "@/components/mgr/views/beer";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { taproomBeerView, toBeerViewProps } from "@/lib/mgr/beer-view";
import "@/lib/commands/all";

type Overview = { fgShortages: number; taproomBelowPar: number; openTaps: number; openOccupancies: number; materialShortages: number; kegsOut: number };

export default async function BeerPage() {
  const brewery = await getActiveBrewery();
  const o = (await runCommand("get_beer_overview", {}, await buildContext(brewery.id))) as Overview | { taproomStock: { skuId: string; locationId: string; sku: string; location: string; qty: number }[] };
  if ("taproomStock" in o) {
    return <BeerView model={taproomBeerView(o.taproomStock)} linkRows />;
  }
  return (
    <BeerView
      model={toBeerViewProps({
        overview: o,
        showTaproom: brewery.role === "admin" || brewery.role === "warehouse",
      })}
      linkRows
    />
  );
}
