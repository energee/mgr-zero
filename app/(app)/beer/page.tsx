// app/(app)/beer/page.tsx — the Beer landing: one row per area with the count
// that area has to say for itself (get_beer_overview), each opening its
// dedicated page. Taproom and Taps stay gated until Program 12 ships the
// weekly count and the tap board.
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

type Overview = { fgShortages: number; taproomBelowPar: number; openTaps: number; openOccupancies: number; materialShortages: number; kegsOut: number };
import { plural } from "@/lib/mgr/plural";

export default async function BeerPage() {
  const brewery = await getActiveBrewery();
  const o = (await runCommand("get_beer_overview", {}, await buildContext(brewery.id))) as Overview;
  return (
    <>
      {E.hd("Beer")}
      {E.nav("Finished goods", `${plural(o.fgShortages, "shortage")} · ATP by SKU`, "", undefined, "/inventory")}
      {E.gated("Taproom", `${plural(o.taproomBelowPar, "SKU")} below par · weekly count isn’t available yet`)}
      {E.gated("Taps", "Tap board isn’t available yet")}
      {E.nav("Cellar", `${plural(o.openOccupancies, "tank")} with beer`, "", undefined, "/cellar")}
      {E.nav("Materials", plural(o.materialShortages, "shortage"), "", undefined, "/materials")}
      {E.nav("Kegs", `${o.kegsOut} out at customers`, "", undefined, "/kegs")}
      {E.blank("Each summary opens its dedicated area; this page does not expand indefinitely.")}
    </>
  );
}
