import Link from "next/link";
import { E } from "@/components/mgr/e";
import { LinkTabs } from "@/components/mgr/work-tabs";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { requirePagePermission, runPageQuery as runCommand } from "@/lib/mgr/page-query";
import type { TapBoardSnapshot, TapHistory, TapInterval } from "@/lib/mgr/tap-board-state";
import "@/lib/commands/all";
import { TapBoard, type TapSku } from "./tap-board";

type Location = { id: string; name: string; kind: string };
type Sku = { id: string; name: string; active: boolean; formats: { package_type: string | null } | null; format_volume: { bbl_per_unit: number | null } | null };

export default async function TapBoardPage({ searchParams }: { searchParams: Promise<{ location?: string }> }) {
  const selected = await searchParams;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  requirePagePermission(ctx, "list_open_taps", "Tap board");
  const [allLocations, allSkus] = await Promise.all([
    runCommand("list_locations", {}, ctx) as Promise<Location[]>,
    runCommand("list_skus", {}, ctx) as Promise<Sku[]>,
  ]);
  const locations = allLocations.filter((location) => location.kind === "taproom");
  const location = locations.find((item) => item.id === selected.location) ?? locations[0];
  if (!location) return <>{E.back("Beer", "Tap board", undefined, "/beer")}{E.blank("No taproom locations yet. Ask Admin to add one under Locations.")}</>;
  const [open, history] = await Promise.all([
    runCommand("list_open_taps", { locationId: location.id }, ctx) as Promise<TapInterval[]>,
    runCommand("list_tap_history", { locationId: location.id }, ctx) as Promise<TapHistory[]>,
  ]);
  const skus: TapSku[] = allSkus.filter((sku) => sku.active && sku.formats?.package_type === "keg" && Number(sku.format_volume?.bbl_per_unit) > 0)
    .map((sku) => ({ id: sku.id, name: sku.name, nominalBbl: Number(sku.format_volume!.bbl_per_unit) }));
  const initial: TapBoardSnapshot = { open, history };

  return <>
    {E.back("Beer", "Tap board", undefined, "/beer")}
    <div className="flex flex-wrap gap-3 text-sm"><Link className="underline" href={`/taproom?location=${location.id}`}>Weekly count</Link><Link className="underline" href={`/taproom/variance?location=${location.id}`}>Variance by brand</Link></div>
    <LinkTabs items={locations.map((item) => [item.name, `/taproom/board?location=${item.id}`])} current={location.name} className="w-full md:w-fit" />
    <TapBoard key={location.id} breweryId={brewery.id} locationId={location.id} initial={initial} skus={skus} />
  </>;
}
