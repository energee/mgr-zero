// app/(app)/replenishment/page.tsx — Pars and allocation (screen record) for
// a taproom: pick a taproom (via ?location=) to see its par, on hand and
// suggested gap per SKU from replenishment_suggestions, then
// replenish-form.tsx picks a source warehouse and submits
// create_replenishment_order. ponytail: the par and standing-allocation
// edits (set_taproom_par, set_standing_allocation, release_allocation) are
// registered but still wait for their forms (TODO.md quick wins).
import { E } from "@/components/mgr/e";
import { LinkTabs } from "@/components/mgr/work-tabs";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
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
  const suggestions = toLocationId ? ((await runCommand("replenishment_suggestions", { locationId: toLocationId }, ctx)) as Suggestion[]) : [];
  return (
    <>
      {E.back("Finished goods", "Pars and allocation", undefined, "/inventory")}
      {taprooms.length === 0
        ? E.blank("No taprooms yet: add one under Locations")
        : <LinkTabs items={taprooms.map((t): [string, string] => [t.name, `/replenishment?location=${t.id}`])} current={taprooms.find((t) => t.id === toLocationId)?.name ?? ""} className="w-full md:w-fit" />}
      {toLocationId && <ReplenishForm toLocationId={toLocationId} warehouses={warehouses.map((w) => ({ id: w.id, name: w.name }))} suggestions={suggestions} />}
    </>
  );
}
