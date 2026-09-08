// app/(app)/inventory/page.tsx — Finished goods (screen record): sellable
// beer by SKU with on hand, allocated and ATP together on each row, then the
// movement ledger (Movement recorded). Record movement opens
// movement-form.tsx, the one append-only inventory write; on hand is read at
// bin grain (get_bin_on_hand) and summed per SKU here.
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { MovementForm } from "./movement-form";

type Sku = { id: string; name: string; brands: { name: string } | null };
type Location = { id: string; name: string; kind: string };
type Bin = { id: string; location_id: string; name: string };
type SaleChannel = { id: string; name: string; tax_treatment: string };
type BinOnHandRow = { sku_id: string; location_id: string; bin_id: string; qty: string };
type AtpRow = { sku_id: string; qty: string };
type Movement = { id: string; created_at: string; type: string; qty: string; sku_id: string; location_id: string; note: string | null };

const skuLabel = (sku: Sku | undefined) => (!sku ? "—" : sku.brands?.name ? `${sku.brands.name} · ${sku.name}` : sku.name);
const sum = (rows: { sku_id: string; qty: string }[]) => rows.reduce((m, r) => m.set(r.sku_id, (m.get(r.sku_id) ?? 0) + Number(r.qty)), new Map<string, number>());

export default async function InventoryPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [skus, locations, bins, channels, onHand, atp, movements] = (await Promise.all([
    runCommand("list_skus", {}, ctx), runCommand("list_locations", {}, ctx), runCommand("list_bins", {}, ctx), runCommand("list_sale_channels", {}, ctx),
    runCommand("get_bin_on_hand", {}, ctx), runCommand("get_atp", {}, ctx), runCommand("list_movements", { limit: 50 }, ctx),
  ])) as [Sku[], Location[], Bin[], SaleChannel[], BinOnHandRow[], AtpRow[], Movement[]];
  const skuById = new Map(skus.map((s) => [s.id, s]));
  const locationById = new Map(locations.map((l) => [l.id, l.name]));
  const locationName = (id: string) => locationById.get(id) ?? "—";
  const have = sum(onHand);
  const atpBySku = new Map(atp.map((a) => [a.sku_id, Number(a.qty)]));
  const stocked = skus.filter((s) => have.has(s.id) || atpBySku.has(s.id));
  return (
    <>
      {E.back("Beer", "Finished goods", <MovementForm skus={skus.map((s) => ({ id: s.id, label: skuLabel(s) }))} locations={locations} bins={bins} channels={channels} />, "/beer")}
      {stocked.length === 0
        ? E.blank("No finished goods yet")
        : stocked.map((s) => {
            const on = have.get(s.id) ?? 0, a = atpBySku.get(s.id) ?? on, allocated = on - a;
            return <div key={s.id}>{E.row(skuLabel(s), `${on} on hand · ${allocated} allocated · ATP ${a}`, a < 0 ? E.act("Shortfall", "attention", "/replenishment") : "", a < 0 ? "w" : "")}</div>;
          })}
      {E.ttl("Movements")}
      {movements.length === 0
        ? E.blank("No movements recorded yet")
        : movements.map((m) => (
            <div key={m.id}>{E.row(`${Number(m.qty) > 0 ? "+" : ""}${m.qty} ${skuLabel(skuById.get(m.sku_id))}`, `${m.type.replace(/_/g, " ")} · ${locationName(m.location_id)}${m.note ? ` · ${m.note}` : ""}`, new Date(m.created_at).toLocaleDateString(), Number(m.qty) < 0 ? "w" : "ok")}</div>
          ))}
    </>
  );
}
