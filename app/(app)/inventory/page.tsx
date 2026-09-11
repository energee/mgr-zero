// app/(app)/inventory/page.tsx — Finished goods (screen record): sellable
// beer by SKU with on hand, allocated and ATP together on each row, then the
// movement ledger (Movement recorded). Record movement opens
// movement-form.tsx, the one append-only inventory write; on hand is read at
// bin grain (get_bin_on_hand) and summed per SKU here. Combined live drawing
// slots into FinishedGoodsView; MovementRecordedView is not mounted here
// because it is the single-row echo.
import { E } from "@/components/mgr/e";
import { FinishedGoodsView } from "@/components/mgr/views/finished-goods";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand, requirePagePermission } from "@/lib/mgr/page-query";
import { toFinishedGoodsViewProps, skuLabel } from "@/lib/mgr/finished-goods-view";
import "@/lib/commands/all";
import { MovementForm } from "./movement-form";
import { formatDateTime } from "@/lib/date-format";
import { movementFormInstanceKey, type MovementInput, type MovementKind } from "@/lib/composer/state";

type Sku = { id: string; name: string; format_volume: { bbl_per_unit: number | null } | null; brands: { name: string } | null };
type Location = { id: string; name: string; kind: string };
type Bin = { id: string; location_id: string; name: string };
type SaleChannel = { id: string; name: string; tax_treatment: string };
type BinOnHandRow = { sku_id: string; location_id: string; bin_id: string; qty: string };
type AtpRow = { sku_id: string; qty: string };
type Movement = { bin_id: string; bbl: string; dest_state: string | null; sale_channel_id: string | null; ref: string | null; id: string; created_at: string; type: string; qty: string; sku_id: string; location_id: string; note: string | null };

const sum = (rows: { sku_id: string; qty: string }[]) => rows.reduce((m, r) => m.set(r.sku_id, (m.get(r.sku_id) ?? 0) + Number(r.qty)), new Map<string, number>());

type InventorySearch = { page?: string; recordMovement?: string; movementHandoff?: string; skuId?: string; locationId?: string; binId?: string; lotId?: string; qty?: string; type?: string; saleChannelId?: string; destState?: string; note?: string };
const movementKinds = new Set<MovementKind>(["opening_balance", "production_in", "adjustment", "depletion", "return_in", "destruction", "loss", "sample", "festival_removal"]);

export default async function InventoryPage({ searchParams }: { searchParams: Promise<InventorySearch> }) {
  const params = await searchParams;
  const { page: rawPage, recordMovement } = params;
  const page = /^\d{1,6}$/.test(rawPage ?? "") ? Math.max(0, Number(rawPage) - 1) : 0;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  requirePagePermission(ctx, "get_atp", "Finished goods");
  const [skus, locations, bins, channels, onHand, atp, movements] = (await Promise.all([
    runCommand("list_skus", {}, ctx), runCommand("list_locations", {}, ctx), runCommand("list_bins", {}, ctx), runCommand("list_sale_channels", {}, ctx),
    runCommand("get_bin_on_hand", {}, ctx), runCommand("get_atp", {}, ctx), runCommand("list_movements", { limit: 51, offset: page * 50 }, ctx),
  ])) as [Sku[], Location[], Bin[], SaleChannel[], BinOnHandRow[], AtpRow[], Movement[]];
  const skuById = new Map(skus.map((s) => [s.id, s]));
  const locationById = new Map(locations.map((l) => [l.id, l.name]));
  const locationName = (id: string) => locationById.get(id) ?? "—";
  const have = sum(onHand);
  const atpBySku = new Map(atp.map((a) => [a.sku_id, Number(a.qty)]));
  const stocked = skus.filter((s) => have.has(s.id) || atpBySku.has(s.id));
  const canMove = brewery.role === "admin" || brewery.role === "warehouse";
  const canAddSku = brewery.role === "admin" || brewery.role === "sales";
  const requestedQty = Number(params.qty);
  const handoffId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(params.movementHandoff ?? "") ? params.movementHandoff : undefined;
  const initial: Partial<MovementInput> | undefined = recordMovement === "1" ? {
    ...(skus.some((sku) => sku.id === params.skuId) ? { skuId: params.skuId } : {}),
    ...(locations.some((location) => location.id === params.locationId) ? { locationId: params.locationId } : {}),
    ...(bins.some((bin) => bin.id === params.binId && (!params.locationId || bin.location_id === params.locationId)) ? { binId: params.binId } : {}),
    ...(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(params.lotId ?? "") ? { lotId: params.lotId } : {}),
    ...(Number.isFinite(requestedQty) && requestedQty !== 0 ? { qty: requestedQty } : {}),
    ...(movementKinds.has(params.type as MovementKind) ? { type: params.type as MovementKind } : {}),
    ...(channels.some((channel) => channel.id === params.saleChannelId) ? { saleChannelId: params.saleChannelId } : {}),
    ...(/^[A-Za-z]{2}$/.test(params.destState ?? "") ? { destState: params.destState!.toUpperCase() } : {}),
    ...(params.note?.trim() ? { note: params.note.slice(0, 500) } : {}),
  } : undefined;
  return (
    <FinishedGoodsView
      model={toFinishedGoodsViewProps({
        skus: stocked.map((s) => {
          const on = have.get(s.id) ?? 0;
          return { id: s.id, name: s.name, brands: s.brands, on_hand: on, atp: atpBySku.get(s.id) ?? on };
        }),
      })}
      createAction={canMove ? <MovementForm key={movementFormInstanceKey(handoffId)} autoOpen={recordMovement === "1"} initial={initial} skus={skus.map((s) => ({ id: s.id, label: skuLabel(s), bblPerUnit: s.format_volume?.bbl_per_unit == null ? null : Number(s.format_volume.bbl_per_unit) }))} locations={locations} bins={bins} channels={channels} /> : null}
      afterHeader={canAddSku ? E.btn("Add SKU", "g", "/catalog") : undefined}
      linkRows
      footer={
        <>
          {E.ttl("Movements")}
          {movements.length === 0
            ? E.blank("No movements recorded yet")
            : movements.slice(0, 50).map((m) => (
              <div key={m.id}>{E.row(`${Number(m.qty) > 0 ? "+" : ""}${m.qty} ${skuLabel(skuById.get(m.sku_id) ?? { name: "—" })}`, `${m.type.replace(/_/g, " ")} · ${locationName(m.location_id)} · ${bins.find(b => b.id === m.bin_id)?.name ?? m.bin_id} · ${m.bbl} bbl${m.dest_state ? ` · ${m.dest_state}` : ""}${m.sale_channel_id ? ` · ${channels.find(c => c.id === m.sale_channel_id)?.name ?? m.sale_channel_id}` : ""}${m.note ? ` · ${m.note}` : ""}`, <span className="break-all">{formatDateTime(m.created_at)} · {m.id}{m.ref ? ` · source ${m.ref}` : ""}</span>, Number(m.qty) < 0 ? "w" : "ok")}</div>
            ))}
          <div className="flex gap-2">{page > 0 && E.btn("Newer movements", "g", `/inventory?page=${page}`)}{movements.length > 50 && E.btn("Older movements", "g", `/inventory?page=${page + 2}`)}</div>
        </>
      }
    />
  );
}
