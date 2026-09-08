// app/(app)/replenishment/page.tsx — Pars and allocation (screen record) for
// a taproom: pick a taproom (via ?location=) to set par/standing, then
// replenish-form.tsx submits create_replenishment_order. Live never invents
// a SKU, ATP, or barrel volume. Warehouse can open the page read-only.
import { LinkTabs } from "@/components/mgr/work-tabs";
import { ParsView } from "@/components/mgr/views/pars";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import { toParsViewProps } from "@/lib/mgr/pars-view";
import "@/lib/commands/all";
import { ReplenishForm } from "./replenish-form";
import { QuantityForm, ReleaseAllocationForm } from "./quantity-form";

type LocationRow = { id: string; name: string; kind: "warehouse" | "taproom" };
type Suggestion = { skuId: string; sku: string; par: number; onHand: number; suggested: number };
type Allocation = { id: string; sku_id: string; qty: number; skus: { name: string } | null };

export default async function ReplenishmentPage({ searchParams }: { searchParams: Promise<{ location?: string }> }) {
  const { location } = await searchParams;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const locationRows = (await runCommand("list_locations", {}, ctx)) as LocationRow[];
  const taprooms = locationRows.filter((l) => l.kind === "taproom");
  const warehouses = locationRows.filter((l) => l.kind === "warehouse");
  const toLocationId = taprooms.find((t) => t.id === location)?.id ?? taprooms[0]?.id;
  const taproom = taprooms.find((t) => t.id === toLocationId);
  const canEdit = ctx.role === "admin" || ctx.role === "sales";
  const [skus, allocations, suggestions] = await Promise.all([
    canEdit ? runCommand("list_skus", {}, ctx) as Promise<{ id: string; name: string }[]> : Promise.resolve([]),
    toLocationId ? runCommand("list_standing_allocations", { locationId: toLocationId }, ctx) as Promise<Allocation[]> : Promise.resolve([]),
    toLocationId ? runCommand("replenishment_suggestions", { locationId: toLocationId }, ctx) as Promise<Suggestion[]> : Promise.resolve([]),
  ]);
  const parValues = Object.fromEntries(suggestions.map((s) => [s.skuId, s.par]));
  const standingValues = Object.fromEntries(allocations.map((a) => [a.sku_id, Number(a.qty)]));
  return (
    <ParsView
      empty={taprooms.length === 0 ? "No taprooms yet: add one under Locations" : undefined}
      model={toParsViewProps({
        standing: allocations.map((a) => ({
          id: a.id,
          sku_id: a.sku_id,
          qty: Number(a.qty),
          ref: a.id,
          skus: a.skus,
        })),
        par: null,
        backHref: "/inventory",
      })}
      filters={taprooms.length === 0
        ? undefined
        : (
          <>
            <LinkTabs items={taprooms.map((t): [string, string] => [t.name, `/replenishment?location=${t.id}`])} current={taproom?.name ?? ""} className="w-full md:w-fit" />
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                <QuantityForm key={`par-${toLocationId}-${JSON.stringify(parValues)}`} locationId={toLocationId!} skus={skus} kind="par" values={parValues} />
                <QuantityForm key={`standing-${toLocationId}-${JSON.stringify(standingValues)}`} locationId={toLocationId!} skus={skus} kind="standing" values={standingValues} />
              </div>
            )}
          </>
        )}
      rowAction={canEdit
        ? (row) => {
          const a = allocations.find((x) => x.id === row.key);
          return a
            ? <ReleaseAllocationForm allocationId={a.id} sku={a.skus?.name ?? a.sku_id} qty={Number(a.qty)} />
            : undefined;
        }
        : undefined}
      footer={toLocationId
        ? <ReplenishForm key={`${toLocationId}-${JSON.stringify(suggestions)}`} toLocationId={toLocationId} canCreate={canEdit} warehouses={warehouses.map((w) => ({ id: w.id, name: w.name }))} suggestions={suggestions} />
        : null}
    />
  );
}
