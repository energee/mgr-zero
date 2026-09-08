// app/(app)/beer/page.tsx — the Beer landing: one row per area with the count
// that area has to say for itself (get_beer_overview), each opening its
// dedicated page. Taproom and Taps stay gated until Program 12 ships the
// weekly count and the tap board.
import Link from "next/link";
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

type Overview = { fgShortages: number; taproomBelowPar: number; openTaps: number; openOccupancies: number; materialShortages: number; kegsOut: number };
const n = (v: number, one: string, many = `${one}s`) => `${v} ${v === 1 ? one : many}`;

export default async function BeerPage() {
  const brewery = await getActiveBrewery();
  const o = (await runCommand("get_beer_overview", {}, await buildContext(brewery.id))) as Overview;
  const nav = (href: string, t: string, s: string) => <Link key={href} href={href} className="block">{E.nav(t, s)}</Link>;
  return (
    <>
      {E.hd("Beer")}
      {nav("/inventory", "Finished goods", `${n(o.fgShortages, "shortage")} · ATP by SKU`)}
      {E.gated("Taproom", `${n(o.taproomBelowPar, "SKU")} below par · weekly count isn’t available yet`)}
      {E.gated("Taps", "Tap board isn’t available yet")}
      {nav("/cellar", "Cellar", n(o.openOccupancies, "tank", "tanks") + " with beer")}
      {nav("/materials", "Materials", n(o.materialShortages, "shortage"))}
      {nav("/kegs", "Kegs", `${o.kegsOut} out at customers`)}
      {E.blank("Each summary opens its dedicated area; this page does not expand indefinitely.")}
    </>
  );
}
