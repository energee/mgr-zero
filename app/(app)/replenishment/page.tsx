import { ParsView } from "@/components/mgr/views/pars";
import { toParsViewProps } from "@/lib/mgr/pars-view";
import { E } from "@/components/mgr/e";
import { LinkTabs } from "@/components/mgr/work-tabs";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { ReplenishForm } from "./replenish-form";
import { QuantityForm, ReleaseAllocationForm } from "./quantity-form";

type LocationRow = { id: string; name: string; kind: "warehouse" | "taproom" };
type Shortfall = { skuId: string; skuName: string; onHand: number; allocated: number; atp: number; reservations: { id: string; source: string; ref: string; qty: number; orderId?: string; orderNo?: number }[] };
type Suggestion = { skuId: string; sku: string; par: number; onHand: number; suggested: number };

export default async function ReplenishmentPage({ searchParams }: { searchParams: Promise<{ location?: string; sku?: string }> }) {
  const { location, sku } = await searchParams;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const shortfalls = await runCommand("get_shortfalls", sku ? { skuId: sku } : {}, ctx) as Shortfall[];
  const locationRows = (await runCommand("list_locations", {}, ctx)) as LocationRow[];
  const taprooms = locationRows.filter((l) => l.kind === "taproom");
  const warehouses = locationRows.filter((l) => l.kind === "warehouse");
  const toLocationId = taprooms.find((t) => t.id === location)?.id ?? taprooms[0]?.id;
  const canEdit = ctx.role === "admin" || ctx.role === "sales";
  const skus = await runCommand("list_skus", {}, ctx) as { id: string; name: string; formats: { name: string; package_type: string } | null; format_volume: { bbl_per_unit: number } | null }[];
  const allocations = toLocationId ? await runCommand("list_standing_allocations", { locationId: toLocationId }, ctx) as { id: string; sku_id: string; qty: number; skus: { name: string } | null }[] : [];
  const suggestions = toLocationId ? ((await runCommand("replenishment_suggestions", { locationId: toLocationId }, ctx)) as Suggestion[]) : [];
  return (
    <>
      {E.back("Finished goods", "Pars and allocation", undefined, "/inventory")}
      {shortfalls.map(shortfall => {
        const item = skus.find(s => s.id === shortfall.skuId);
        const unit = item?.formats?.name ?? "unit";
        const model = toParsViewProps({ shortfall, unit, bblPerUnit: item?.format_volume?.bbl_per_unit == null ? null : Number(item.format_volume.bbl_per_unit), orderAllocations: [], standing: [], par: null });
        model.atpDetail += " across all locations";
        model.rows = shortfall.reservations.map(r => ({ key: r.id, title: r.source === "order_line" ? `Order ${r.orderNo ?? r.ref}` : `Standing allocation · ${locationRows.find(l => l.id === r.ref)?.name ?? r.ref}`, detail: `${r.qty} ${unit} reserved`, verb: "Review", tone: "primary", href: r.orderId ? `/orders/${r.orderId}` : r.source === "taproom_standing" ? `/replenishment?location=${r.ref}&sku=${shortfall.skuId}#standing-allocations` : undefined }));
        return <section key={shortfall.skuId} aria-label={`${shortfall.skuName} shortfall`}><ParsView model={model} linkRows footer={<></>} /></section>;
      })}
      {sku && <div>{shortfalls.length === 0 && E.note("This SKU has no current shortfall.")}{E.btn("All shortfalls", "g", "/replenishment")}</div>}
      {taprooms.length === 0
        ? E.blank("No taprooms yet: add one under Locations")
        : <LinkTabs items={taprooms.map((t): [string, string] => [t.name, `/replenishment?location=${t.id}${sku ? `&sku=${sku}` : ""}`])} current={taprooms.find((t) => t.id === toLocationId)?.name ?? ""} className="w-full md:w-fit" />}
      {toLocationId && <>
        {canEdit && <div className="flex flex-wrap gap-2">
          <QuantityForm key={`par-${toLocationId}-${JSON.stringify(suggestions)}`} locationId={toLocationId} skus={skus} kind="par" values={Object.fromEntries(suggestions.map((s) => [s.skuId, s.par]))} />
          <QuantityForm key={`standing-${toLocationId}-${JSON.stringify(allocations)}`} locationId={toLocationId} skus={skus} kind="standing" values={Object.fromEntries(allocations.map((a) => [a.sku_id, Number(a.qty)]))} />
        </div>}
        <ReplenishForm key={`${toLocationId}-${JSON.stringify(suggestions)}`} toLocationId={toLocationId} canCreate={canEdit} warehouses={warehouses.map((w) => ({ id: w.id, name: w.name }))} suggestions={suggestions} />
        <h2 id="standing-allocations" className="text-lg font-semibold">Standing allocations</h2>
        {allocations.length ? allocations.map((a) => <div key={a.id}>{E.row(a.skus?.name ?? a.sku_id, `${a.qty} units reserved`, canEdit ? <ReleaseAllocationForm allocationId={a.id} sku={a.skus?.name ?? a.sku_id} qty={Number(a.qty)} /> : undefined)}</div>) : E.blank("No standing allocations for this taproom.")}
      </>}
    </>
  );
}
