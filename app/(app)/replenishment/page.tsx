// app/(app)/replenishment/page.tsx — Pars and allocation (screen record) for
// a taproom: pick a taproom (via ?location=) to see shortfalls and standing
// allocations, then replenish-form.tsx submits create_replenishment_order.
// Order-allocation Adjust/Release rows wait on a dedicated join; the inventory
// fixture already draws them.
import { LinkTabs } from "@/components/mgr/work-tabs";
import { ParsView } from "@/components/mgr/views/pars";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import { toParsViewProps, type ParsShortfall, type ParsStandingAllocation } from "@/lib/mgr/pars-view";
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
  const [suggestions, shortfalls, standing] = toLocationId
    ? await Promise.all([
      runCommand("replenishment_suggestions", { locationId: toLocationId }, ctx) as Promise<Suggestion[]>,
      runCommand("get_shortfalls", {}, ctx) as Promise<ParsShortfall[]>,
      runCommand("list_standing_allocations", { locationId: toLocationId }, ctx) as Promise<ParsStandingAllocation[]>,
    ])
    : [[], [], []] as [Suggestion[], ParsShortfall[], ParsStandingAllocation[]];
  const shortfall = shortfalls[0] ?? (suggestions[0]
    ? { skuId: suggestions[0].skuId, skuName: suggestions[0].sku, atp: 0, onHand: suggestions[0].onHand, allocated: 0 }
    : { skuId: "", skuName: "Pars and allocation", atp: 0, onHand: 0, allocated: 0 });
  const par = suggestions.find((s) => s.skuId === shortfall.skuId);
  return (
    <ParsView
      linkRows
      empty={taprooms.length === 0 ? "No taprooms yet: add one under Locations" : undefined}
      model={toParsViewProps({
        shortfall,
        bblPerUnit: 0,
        unit: "case",
        orderAllocations: [],
        standing: standing.filter((a) => !shortfall.skuId || a.sku_id === shortfall.skuId).map((a) => ({
          ...a,
          locations: taproom ? { name: taproom.name } : a.locations,
        })),
        par: par && taproom ? { location_id: taproom.id, location_name: taproom.name, par_qty: par.par } : null,
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
