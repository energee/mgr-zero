// app/(app)/inventory/page.tsx — Finished goods (screen record): sellable
// beer by SKU with on hand, allocated and ATP, plus frozen-cost value for Admin/Sales, then the
// movement ledger. Record movement opens movement-form.tsx, the one
// append-only inventory write; on hand is read at bin grain (get_bin_on_hand),
// summed per SKU here, and handed to the form so a chosen SKU starts on the
// bin holding the most of it. Combined live drawing slots into
// FinishedGoodsView. Add SKU in Catalog sits beside Record
// movement, and the form's empty SKU picker links Catalog, only for a user who
// may create a SKU (#1113). Each active SKU's row opens Record movement on
// that SKU for the same roles (#1507).
import { E } from "@/components/mgr/e";
import { sentenceCase } from "@/lib/mgr/labels";
import { FinishedGoodsView } from "@/components/mgr/views/finished-goods";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext, isUuid } from "@/lib/commands/context";
import { runPageQuery as runCommand, requirePagePermission } from "@/lib/mgr/page-query";
import { canRun } from "@/lib/commands/registry";
import type { InventoryValue } from "@/lib/commands/inventory";
import { assembleFinishedGoods, toFinishedGoodsViewProps, skuLabel } from "@/lib/mgr/finished-goods-view";
import "@/lib/commands/all";
import { MovementForm } from "./movement-form";
import { formatDateTime } from "@/lib/date-format";
import { movementFormInstanceKey } from "@/lib/composer/state";
import { movementInput, type MovementInput, type MovementKind } from "@/lib/commands/movement-input";
import { navTitle } from "@/lib/mgr/nav";
import { historyPage, pageCursor, type HistoryPage } from "@/lib/mgr/history-page";

export const metadata = { title: navTitle("/inventory") };

type Sku = { id: string; name: string; active: boolean; format_volume: { bbl_per_unit: number | null } | null; brands: { name: string } | null };
type Location = { id: string; name: string; uses: string[] };
type Bin = { id: string; location_id: string; name: string };
type SaleChannel = { id: string; name: string; tax_treatment: string };
type BinOnHandRow = { sku_id: string; location_id: string; bin_id: string; qty: string };
type AtpRow = { sku_id: string; qty: string };
type Movement = { bin_id: string; bbl: string; dest_state: string | null; sale_channel_id: string | null; ref_label: string | null; lots: { code: string } | null; id: string; created_at: string; type: string; qty: string; sku_id: string; location_id: string; note: string | null };

type InventorySearch = { cursor?: string; recordMovement?: string; movementHandoff?: string; skuId?: string; locationId?: string; binId?: string; lotId?: string; qty?: string; type?: string; saleChannelId?: string; destState?: string; note?: string };
const movementKinds = new Set<string>(movementInput.shape.type.options);

export default async function InventoryPage({ searchParams }: { searchParams: Promise<InventorySearch> }) {
  const params = await searchParams;
  const { recordMovement } = params;
  const cursor = pageCursor(params.cursor);
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  requirePagePermission(ctx, "get_atp", "Finished goods");
  const [skus, locations, bins, channels, onHand, atp, records, value] = (await Promise.all([
    runCommand("list_skus", {}, ctx), runCommand("list_locations", {}, ctx), runCommand("list_bins", {}, ctx), runCommand("list_sale_channels", {}, ctx),
    runCommand("get_bin_on_hand", {}, ctx), runCommand("get_atp", {}, ctx), runCommand("list_movements", { cursor }, ctx),
    canRun(ctx, "get_inventory_value") ? runCommand("get_inventory_value", {}, ctx) : undefined,
  ])) as [Sku[], Location[], Bin[], SaleChannel[], BinOnHandRow[], AtpRow[], HistoryPage<Movement>, InventoryValue | undefined];
  const { rows: movements, pagination } = historyPage(records, "/inventory", cursor);
  const skuById = new Map(skus.map((s) => [s.id, s]));
  const locationById = new Map(locations.map((l) => [l.id, l.name]));
  const locationName = (id: string) => locationById.get(id) ?? "—";
  const canMove = brewery.roles.includes("admin") || brewery.roles.includes("warehouse");
  const skusHref = canRun(ctx, "create_sku") ? "/catalog" : null;
  const requestedQty = Number(params.qty);
  const handoffId = isUuid(params.movementHandoff) ? params.movementHandoff : undefined;
  const initial: Partial<MovementInput> | undefined = recordMovement === "1" ? {
    ...(skus.some((sku) => sku.id === params.skuId) ? { skuId: params.skuId } : {}),
    ...(locations.some((location) => location.id === params.locationId) ? { locationId: params.locationId } : {}),
    ...(bins.some((bin) => bin.id === params.binId && (!params.locationId || bin.location_id === params.locationId)) ? { binId: params.binId } : {}),
    ...(isUuid(params.lotId) ? { lotId: params.lotId } : {}),
    ...(Number.isFinite(requestedQty) && requestedQty !== 0 ? { qty: requestedQty } : {}),
    ...(movementKinds.has(params.type as MovementKind) ? { type: params.type as MovementKind } : {}),
    ...(channels.some((channel) => channel.id === params.saleChannelId) ? { saleChannelId: params.saleChannelId } : {}),
    ...(/^[A-Za-z]{2}$/.test(params.destState ?? "") ? { destState: params.destState!.toUpperCase() } : {}),
    ...(params.note?.trim() ? { note: params.note.slice(0, 500) } : {}),
  } : undefined;
  const initialLot = initial?.lotId && canMove
    ? await runCommand("get_inventory_lot", { lotId: initial.lotId }, ctx) as { id: string; code: string } | null
    : null;
  return (
    <FinishedGoodsView
      model={toFinishedGoodsViewProps(assembleFinishedGoods(skus, onHand, atp, value))}
      createAction={canMove ? <MovementForm key={movementFormInstanceKey(handoffId)} initial={initial} initialLot={initialLot} skus={skus.map((s) => ({ id: s.id, label: skuLabel(s), bblPerUnit: s.format_volume?.bbl_per_unit == null ? null : Number(s.format_volume.bbl_per_unit) }))} locations={locations} bins={bins} channels={channels} onHand={onHand} skusHref={skusHref} /> : null}
      addSkuHref={skusHref}
      countHref={canRun(ctx, "record_taproom_count") ? "/taproom" : null}
      linkRows
      footer={
        <>
          {E.ttl("Movements")}
          {movements.length === 0
            ? E.blank("No movements recorded yet")
            : movements.map((m) => (
              <div key={m.id}>{E.row(`${Number(m.qty) > 0 ? "+" : ""}${m.qty} ${skuLabel(skuById.get(m.sku_id) ?? { name: "—" })}`, `${sentenceCase(m.type)} · ${locationName(m.location_id)} · ${bins.find(b => b.id === m.bin_id)?.name ?? "—"}${m.lots?.code ? ` · ${m.lots.code}` : ""} · ${m.bbl} bbl${m.dest_state ? ` · ${m.dest_state}` : ""}${m.sale_channel_id ? ` · ${channels.find(c => c.id === m.sale_channel_id)?.name ?? "—"}` : ""}${m.note ? ` · ${m.note}` : ""}`, <span>{formatDateTime(m.created_at, brewery.timeZone)}{m.ref_label ? ` · ${m.ref_label}` : ""}</span>, Number(m.qty) < 0 ? "w" : "ok")}</div>
            ))}
          <div className="flex gap-2">{pagination.firstHref && E.btn("Newest movements", "g", pagination.firstHref)}{pagination.moreHref && E.btn("Older movements", "g", pagination.moreHref)}</div>
        </>
      }
    />
  );
}
