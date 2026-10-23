import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { CommandError, type Ctx } from "@/lib/commands/registry";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toPosMenuModel, toPosMenuSetup, toPosVariationRow, type PosMenuSnapshot } from "@/lib/mgr/pos-view";
import { hasAnyRole } from "@/lib/mgr/roles";
import "@/lib/commands/all";
import { PosMenuControl } from "@/components/mgr/views/pos-controls";
import { navTitle } from "@/lib/mgr/nav";

export const metadata = { title: navTitle("/menu") };

type ObservedLocation = { externalLocationId: string; name: string | null; mgrLocationId: string | null };
type Channel = { id: string; name: string };
type Bin = { id: string; name: string };
type Sku = { id: string; name: string };
type Variation = Parameters<typeof toPosVariationRow>[0];
// formats_poured_group_chk: every pour belongs to a price group.
type Format = { id: string; name: string; price_groups: { name: string } };

/** What an "Also in Square" row can map to: an active SKU or a pour. */
async function mapTargets(ctx: Ctx) {
  const [skus, formats] = await Promise.all([
    runCommand("list_skus", { active: true }, ctx) as Promise<Sku[]>,
    runCommand("list_formats", { basis: "poured" }, ctx) as Promise<Format[]>,
  ]);
  return [
    ...skus.map(row => ({ value: `sku:${row.id}`, label: `SKU · ${row.name}` })),
    ...formats.map(row => ({ value: `format:${row.id}`, label: `Pour · ${row.price_groups.name} · ${row.name}` })),
  ];
}

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
  const [observed, channels, variations] = await Promise.all([
    runCommand("list_pos_locations", {}, ctx) as Promise<ObservedLocation[]>,
    runCommand("list_sale_channels", {}, ctx) as Promise<Channel[]>,
    // Not tied to a location or a configured menu: a sale anywhere asks for a decision.
    runCommand("list_pos_variations", { selling: true }, ctx) as Promise<Variation[]>,
  ]);
  const mapped = observed.filter(row => row.mgrLocationId).map(row => ({ externalLocationId: row.externalLocationId, name: row.name ?? row.externalLocationId, mgrLocationId: row.mgrLocationId }));
  const location = mapped.find(row => row.externalLocationId === selected.location) ?? mapped[0];
  const [snapshot, bins] = location ? await Promise.all([
    readMenu(ctx, location.externalLocationId),
    runCommand("list_bins", { locationId: location.mgrLocationId }, ctx) as Promise<Bin[]>,
  ]) : [null, [] as Bin[]];
  const model = toPosMenuModel(snapshot, mapped, location?.externalLocationId ?? "");
  if (!location) {
    // Locations outlive a disconnect, so only the connection says whether Square is connected (#1039);
    // get_square_connected answers that, and only that, for every Menu role (#1083).
    const { connected } = await runCommand("get_square_connected", {}, ctx) as { connected: boolean };
    model.setup = toPosMenuSetup({ admin: hasAnyRole(brewery.roles, ["admin"]), connected, observed: observed.length });
  }
  model.externalItems = variations.map(toPosVariationRow);
  const targets = model.externalItems.length ? await mapTargets(ctx) : [];
  return <PosMenuControl model={model} bins={bins} channels={channels} targets={targets} />;
}
