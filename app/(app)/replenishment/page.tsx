import { toParsViewProps } from "@/lib/mgr/pars-view";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { ReplenishForm } from "./replenish-form";
import { navTitle } from "@/lib/mgr/nav";
import type { ReplenishmentViewModel } from "@/lib/mgr/replenishment-view";
import { workHrefsFor } from "@/components/mgr/work-tabs";

export const metadata = { title: navTitle("/replenishment") };

type LocationRow = { id: string; name: string; uses: ("warehouse" | "taproom" | "storage")[] };
type Shortfall = { skuId: string; skuName: string; onHand: number; allocated: number; atp: number; reservations: { id: string; source: string; ref: string; qty: number; orderId?: string; orderNo?: number }[] };
type Suggestion = { skuId: string; sku: string; par: number; onHand: number; suggested: number };

export default async function ReplenishmentPage({ searchParams }: { searchParams: Promise<{ location?: string; sku?: string }> }) {
  const { location, sku } = await searchParams;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  // list_locations filters by use in Postgres, so ask it for the two subsets
  // this page draws rather than reading every location and discarding most of
  // them here. A standing allocation's `ref` is a taproom, so the two subsets
  // together still name every location a reservation points at.
  // The selected taproom's allocations and suggestions wait only on the taproom list, not on the other reads.
  const taproomRead = runCommand("list_locations", { use: "taproom" }, ctx) as Promise<LocationRow[]>;
  const forTaproom = async () => {
    const taprooms = await taproomRead;
    const toLocationId = taprooms.find((t) => t.id === location)?.id ?? taprooms[0]?.id;
    const [allocations, suggestions] = toLocationId ? await Promise.all([
      runCommand("list_standing_allocations", { locationId: toLocationId }, ctx) as Promise<{ id: string; sku_id: string; qty: number; skus: { name: string } | null }[]>,
      runCommand("replenishment_suggestions", { locationId: toLocationId }, ctx) as Promise<Suggestion[]>,
    ]) : [[], []];
    return { taprooms, toLocationId, allocations, suggestions };
  };
  const [shortfalls, { taprooms, toLocationId, allocations, suggestions }, warehouses, skus] = await Promise.all([
    runCommand("get_shortfalls", sku ? { skuId: sku } : {}, ctx) as Promise<Shortfall[]>,
    forTaproom(),
    runCommand("list_locations", { use: "warehouse" }, ctx) as Promise<LocationRow[]>,
    runCommand("list_skus", {}, ctx) as Promise<{ id: string; name: string; formats: { name: string; package_type: string } | null; format_volume: { bbl_per_unit: number } | null }[]>,
  ]);
  const locationRows = [...taprooms, ...warehouses];
  const selectedLocation = taprooms.find(t => t.id === toLocationId);
  const model: ReplenishmentViewModel = {
    backHref: "/work",
    locationId: toLocationId ?? null,
    locationName: selectedLocation?.name ?? null,
    locations: taprooms.map(t => ({
      value: t.id,
      label: t.name,
      href: `/replenishment?location=${t.id}${sku ? `&sku=${sku}` : ""}`,
    })),
    locationsHref: "/locations",
    warehouses: warehouses.filter(w => w.id !== toLocationId).map(w => ({ id: w.id, name: w.name })),
    suggestions,
    allocations: allocations.map(a => ({ id: a.id, skuId: a.sku_id, sku: a.skus?.name ?? a.sku_id, qty: Number(a.qty) })),
    shortfalls: shortfalls.map(shortfall => {
      const item = skus.find(s => s.id === shortfall.skuId);
      const unit = item?.formats?.name ?? "unit";
      const detail = toParsViewProps({
        shortfall, unit,
        bblPerUnit: item?.format_volume?.bbl_per_unit == null ? null : Number(item.format_volume.bbl_per_unit),
        orderAllocations: [], standing: [], par: null,
      });
      detail.atpDetail += " across all locations";
      detail.rows = shortfall.reservations.map(r => ({
        key: r.id,
        title: r.source === "order_line" ? `Order ${r.orderNo ?? r.ref}` : `Standing allocation · ${locationRows.find(l => l.id === r.ref)?.name ?? r.ref}`,
        detail: `${r.qty} ${unit} reserved`,
        verb: "Review",
        tone: "primary",
        href: r.orderId ? `/orders/${r.orderId}` : r.source === "taproom_standing" ? `/replenishment?location=${r.ref}&sku=${shortfall.skuId}#standing-allocations` : undefined,
      }));
      return { skuId: shortfall.skuId, onHand: shortfall.onHand, allocated: shortfall.allocated, atp: shortfall.atp, detail };
    }),
    canEdit: ctx.roles.includes("admin") || ctx.roles.includes("sales"),
    skuFilter: sku,
    allShortfallsHref: `/replenishment${location ? `?location=${location}` : ""}#shortfalls`,
  };
  return <ReplenishForm key={`${toLocationId}-${JSON.stringify(suggestions)}`} model={model} skus={skus} workHrefs={workHrefsFor(brewery.roles)} />;
}
