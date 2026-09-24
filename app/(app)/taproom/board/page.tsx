import { TapBoardView } from "@/components/mgr/views/tap-board";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { requirePagePermission, runPageQuery as runCommand } from "@/lib/mgr/page-query";
import type { TapBoardSnapshot, TapHistory, TapInterval } from "@/lib/mgr/tap-board-state";
import "@/lib/commands/all";
import { TapBoard, type TapSku } from "./tap-board";

type Location = { id: string; name: string; uses: string[] };
type Sku = { id: string; name: string; active: boolean; formats: { package_type: string | null } | null; format_volume: { bbl_per_unit: number | null } | null };

export default async function TapBoardPage({ searchParams }: { searchParams: Promise<{ location?: string }> }) {
  const selected = await searchParams;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  requirePagePermission(ctx, "list_open_taps", "Tap board");
  const [locations, allSkus] = await Promise.all([
    runCommand("list_locations", { use: "taproom" }, ctx) as Promise<Location[]>,
    runCommand("list_skus", {}, ctx) as Promise<Sku[]>,
  ]);
  const location = locations.find((item) => item.id === selected.location) ?? locations[0];
  if (!location) return <TapBoardView state={{ snapshot: { open: [], history: [] }, sheet: null }} skus={[]} timeZone={brewery.timeZone} navigation={{ backHref: "/beer", locations: [], location: "" }} />;
  const [open, history] = await Promise.all([
    runCommand("list_open_taps", { locationId: location.id }, ctx) as Promise<TapInterval[]>,
    runCommand("list_tap_history", { locationId: location.id }, ctx) as Promise<TapHistory[]>,
  ]);
  const skus: TapSku[] = allSkus.filter((sku) => sku.active && sku.formats?.package_type === "keg" && Number(sku.format_volume?.bbl_per_unit) > 0)
    .map((sku) => ({ id: sku.id, name: sku.name, nominalBbl: Number(sku.format_volume!.bbl_per_unit) }));
  const initial: TapBoardSnapshot = { open, history };

  return <TapBoard key={location.id} breweryId={brewery.id} locationId={location.id} initial={initial} skus={skus} timeZone={brewery.timeZone} navigation={{
    backHref: "/beer", countHref: `/taproom?location=${location.id}`, varianceHref: `/taproom/variance?location=${location.id}`,
    locations: locations.map(item => [item.name, `/taproom/board?location=${item.id}`]), location: location.name,
  }} />;
}
