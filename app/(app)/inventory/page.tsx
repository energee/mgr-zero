// app/(app)/inventory/page.tsx — Finished goods (screen record): sellable
// beer by SKU with on hand, allocated and ATP together on each row, then the
// movement ledger (Movement recorded). Record movement opens
// movement-form.tsx, the one append-only inventory write; on hand is read at
// bin grain (get_bin_on_hand) and summed per SKU here.
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand, requirePagePermission } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { MovementForm } from "./movement-form";

type Sku = { id: string; name: string; format_volume: { bbl_per_unit: number | null } | null; brands: { name: string } | null };
type Location = { id: string; name: string; kind: string };
type Bin = { id: string; location_id: string; name: string };
type SaleChannel = { id: string; name: string; tax_treatment: string };
type BinOnHandRow = { sku_id: string; location_id: string; bin_id: string; qty: string };
type AtpRow = { sku_id: string; qty: string };
type Movement = { bin_id: string; bbl: string; dest_state: string | null; sale_channel_id: string | null; ref: string | null; id: string; created_at: string; type: string; qty: string; sku_id: string; location_id: string; note: string | null };

const skuLabel = (sku: Sku | undefined) => (!sku ? "—" : sku.brands?.name ? `${sku.brands.name} · ${sku.name}` : sku.name);
const sum = (rows: { sku_id: string; qty: string }[]) => rows.reduce((m, r) => m.set(r.sku_id, (m.get(r.sku_id) ?? 0) + Number(r.qty)), new Map<string, number>());

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: rawPage } = await searchParams;
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
  return (
    <>
      {E.back("Beer", "Finished goods", (brewery.role === "admin" || brewery.role === "warehouse") ? <MovementForm skus={skus.map((s) => ({ id: s.id, label: skuLabel(s), bblPerUnit: s.format_volume?.bbl_per_unit == null ? null : Number(s.format_volume.bbl_per_unit) }))} locations={locations} bins={bins} channels={channels} /> : undefined, "/beer")}
      {(brewery.role === "admin" || brewery.role === "sales") && E.btn("Add SKU", "g", "/catalog")}
      {stocked.length === 0
        ? E.blank("No finished goods yet")
        : stocked.map((s) => {
            const on = have.get(s.id) ?? 0, a = atpBySku.get(s.id) ?? on, allocated = on - a;
            return <div key={s.id}>{E.row(skuLabel(s), `${on} on hand · ${allocated} allocated · ATP ${a}`, a < 0 ? E.act("Shortfall", "attention", `/replenishment?sku=${s.id}`) : "", a < 0 ? "w" : "")}</div>;
          })}
      {E.ttl("Movements")}
      {movements.length === 0
        ? E.blank("No movements recorded yet")
        : movements.slice(0, 50).map((m) => (
            <div key={m.id}>{E.row(`${Number(m.qty) > 0 ? "+" : ""}${m.qty} ${skuLabel(skuById.get(m.sku_id))}`, `${m.type.replace(/_/g, " ")} · ${locationName(m.location_id)} · ${bins.find(b => b.id === m.bin_id)?.name ?? m.bin_id} · ${m.bbl} bbl${m.dest_state ? ` · ${m.dest_state}` : ""}${m.sale_channel_id ? ` · ${channels.find(c => c.id === m.sale_channel_id)?.name ?? m.sale_channel_id}` : ""}${m.note ? ` · ${m.note}` : ""}`, <span className="break-all">{new Date(m.created_at).toLocaleString()} · {m.id}{m.ref ? ` · source ${m.ref}` : ""}</span>, Number(m.qty) < 0 ? "w" : "ok")}</div>
          ))}
      <div className="flex gap-2">{page > 0 && E.btn("Newer movements", "g", `/inventory?page=${page}`)}{movements.length > 50 && E.btn("Older movements", "g", `/inventory?page=${page + 2}`)}</div>
    </>
  );
}
