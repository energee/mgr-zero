import { E } from "@/components/mgr/e";
import { LinkTabs } from "@/components/mgr/work-tabs";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { ReplenishForm } from "./replenish-form";
import { QuantityForm, ReleaseAllocationForm } from "./quantity-form";

type LocationRow = { id: string; name: string; kind: "warehouse" | "taproom" };
type Suggestion = { skuId: string; sku: string; par: number; onHand: number; suggested: number };

export default async function ReplenishmentPage({ searchParams }: { searchParams: Promise<{ location?: string }> }) {
  const { location } = await searchParams;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const locationRows = (await runCommand("list_locations", {}, ctx)) as LocationRow[];
  const taprooms = locationRows.filter((l) => l.kind === "taproom");
  const warehouses = locationRows.filter((l) => l.kind === "warehouse");
  const toLocationId = taprooms.find((t) => t.id === location)?.id ?? taprooms[0]?.id;
  const canEdit = ctx.role === "admin" || ctx.role === "sales";
  const [skus, allocations, suggestions] = await Promise.all([
    canEdit ? runCommand("list_skus", {}, ctx) as Promise<{ id: string; name: string }[]> : Promise.resolve([]),
    toLocationId ? runCommand("list_standing_allocations", { locationId: toLocationId }, ctx) as Promise<{ id: string; sku_id: string; qty: number; skus: { name: string } | null }[]> : Promise.resolve([]),
    toLocationId ? runCommand("replenishment_suggestions", { locationId: toLocationId }, ctx) as Promise<Suggestion[]> : Promise.resolve([]),
  ]);
  const parValues = Object.fromEntries(suggestions.map((s) => [s.skuId, s.par]));
  const standingValues = Object.fromEntries(allocations.map((a) => [a.sku_id, Number(a.qty)]));
  return (
    <>
      {E.back("Finished goods", "Pars and allocation", undefined, "/inventory")}
      {taprooms.length === 0
        ? E.blank("No taprooms yet: add one under Locations")
        : <LinkTabs items={taprooms.map((t): [string, string] => [t.name, `/replenishment?location=${t.id}`])} current={taprooms.find((t) => t.id === toLocationId)?.name ?? ""} className="w-full md:w-fit" />}
      {toLocationId && <>
        {canEdit && <div className="flex flex-wrap gap-2">
          <QuantityForm key={`par-${toLocationId}-${JSON.stringify(parValues)}`} locationId={toLocationId} skus={skus} kind="par" values={parValues} />
          <QuantityForm key={`standing-${toLocationId}-${JSON.stringify(standingValues)}`} locationId={toLocationId} skus={skus} kind="standing" values={standingValues} />
        </div>}
        <ReplenishForm key={`${toLocationId}-${JSON.stringify(suggestions)}`} toLocationId={toLocationId} canCreate={canEdit} warehouses={warehouses.map((w) => ({ id: w.id, name: w.name }))} suggestions={suggestions} />
        <h2 className="text-lg font-semibold">Standing allocations</h2>
        {allocations.length ? allocations.map((a) => <div key={a.id}>{E.row(a.skus?.name ?? a.sku_id, `${a.qty} units reserved`, canEdit ? <ReleaseAllocationForm allocationId={a.id} sku={a.skus?.name ?? a.sku_id} qty={Number(a.qty)} /> : undefined)}</div>) : E.blank("No standing allocations for this taproom.")}
      </>}
    </>
  );
}
