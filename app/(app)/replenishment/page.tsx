// app/(app)/replenishment/page.tsx — Pars and allocation (screen record) for
// a taproom: pick a taproom (via ?location=) to see standing allocations and
// replenishment suggestions, then replenish-form.tsx submits
// create_replenishment_order. Order-allocation Adjust/Release rows wait on a
// dedicated join; the inventory fixture already draws them. Live never invents
// a SKU, ATP, or barrel volume.
import { LinkTabs } from "@/components/mgr/work-tabs";
import { ParsView } from "@/components/mgr/views/pars";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import { toParsViewProps, type ParsStandingAllocation } from "@/lib/mgr/pars-view";
import "@/lib/commands/all";
import { ReplenishForm } from "./replenish-form";

type LocationRow = { id: string; name: string; kind: "warehouse" | "taproom" };
type Suggestion = { skuId: string; sku: string; par: number; onHand: number; suggested: number };

export default async function ReplenishmentPage({ searchParams }: { searchParams: Promise<{ location?: string }> }) {
  const { location } = await searchParams;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const locationRows = (await runCommand("list_locations", {}, ctx)) as LocationRow[];
  const taprooms = locationRows.filter((l) => l.kind === "taproom");
  const warehouses = locationRows.filter((l) => l.kind === "warehouse");
  const toLocationId = location ?? taprooms[0]?.id;
  const taproom = taprooms.find((t) => t.id === toLocationId);
  const [suggestions, standing] = toLocationId
    ? await Promise.all([
      runCommand("replenishment_suggestions", { locationId: toLocationId }, ctx) as Promise<Suggestion[]>,
      runCommand("list_standing_allocations", { locationId: toLocationId }, ctx) as Promise<ParsStandingAllocation[]>,
    ])
    : [[], []] as [Suggestion[], ParsStandingAllocation[]];
  const standingRows = standing.map((a) => ({
    ...a,
    locations: taproom ? { name: taproom.name } : a.locations,
  }));
  return (
    <ParsView
      linkRows
      empty={taprooms.length === 0 ? "No taprooms yet: add one under Locations" : undefined}
      model={toParsViewProps({
        orderAllocations: [],
        standing: standingRows,
        par: null,
        backHref: "/inventory",
      })}
      filters={taprooms.length === 0
        ? undefined
        : <LinkTabs items={taprooms.map((t): [string, string] => [t.name, `/replenishment?location=${t.id}`])} current={taproom?.name ?? ""} className="w-full md:w-fit" />}
      footer={toLocationId
        ? <ReplenishForm toLocationId={toLocationId} warehouses={warehouses.map((w) => ({ id: w.id, name: w.name }))} suggestions={suggestions} />
        : undefined}
    />
  );
}
