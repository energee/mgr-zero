import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { CommandError, type Ctx } from "@/lib/commands/registry";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toPosMenuModel, toPosMenuSetup, type PosMenuSnapshot } from "@/lib/mgr/pos-view";
import { hasAnyRole } from "@/lib/mgr/roles";
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
  if (!location) {
    // Locations outlive a disconnect, so an admin reads the connection itself (#1039). Connection
    // health is admin-only; for others, any observed location is the best sign Square was connected.
    const admin = hasAnyRole(brewery.roles, ["admin"]);
    const connected = admin ? (await runCommand("get_pos_integration_health", {}, ctx) as { connected: boolean }).connected : observed.length > 0;
    model.setup = toPosMenuSetup(connected, admin);
  }
  return <PosMenuControl model={model} bins={bins} channels={channels} />;
}
