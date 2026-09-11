import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { CommandError, type Ctx } from "@/lib/commands/registry";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toPosMenuModel, type PosMenuSnapshot } from "@/lib/mgr/pos-view";
import "@/lib/commands/all";
import { PosMenuControl } from "@/components/mgr/views/pos-controls";

type ObservedLocation = { externalLocationId: string; name: string | null; mgrLocationId: string | null };
type Channel = { id: string; name: string };
type Bin = { id: string; name: string };

async function readMenu(ctx: Ctx, posLocationId: string) {
  try {
    return await runCommand("get_pos_menu", { posLocationId }, ctx) as PosMenuSnapshot;
  } catch (error) {
    if (error instanceof CommandError && (error.code === "not_found" || error.message === "Menu is not configured")) return null;
    throw error;
  }
}

export default async function MenuPage({ searchParams }: { searchParams: Promise<{ location?: string }> }) {
  const selected = await searchParams, brewery = await getActiveBrewery(), ctx = await buildContext(brewery.id);
  const [observed, channels] = await Promise.all([
    runCommand("list_pos_locations", {}, ctx) as Promise<ObservedLocation[]>,
    runCommand("list_sale_channels", {}, ctx) as Promise<Channel[]>,
  ]);
  const mapped = observed.filter(row => row.mgrLocationId).map(row => ({ externalLocationId: row.externalLocationId, name: row.name ?? row.externalLocationId, mgrLocationId: row.mgrLocationId }));
  const location = mapped.find(row => row.externalLocationId === selected.location) ?? mapped[0];
  const [snapshot, bins] = location ? await Promise.all([
    readMenu(ctx, location.externalLocationId),
    runCommand("list_bins", { locationId: location.mgrLocationId }, ctx) as Promise<Bin[]>,
  ]) : [null, [] as Bin[]];
  const model = toPosMenuModel(snapshot, mapped, location?.externalLocationId ?? "");
  return <PosMenuControl model={model} bins={bins} channels={channels} />;
}
