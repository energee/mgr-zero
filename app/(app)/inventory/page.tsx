// app/(app)/inventory/page.tsx — on-hand/ATP inventory + movement log.
// Server-rendered from Supabase, explicitly scoped to the active brewery
// (getActiveBrewery + .eq("brewery_id", ...)): RLS alone isn't enough here
// because a user who is staff at two breweries would otherwise see a merged
// view of both under one brewery's header. On-hand/ATP/movements are read
// through the command registry's get_on_hand/get_atp/list_movements queries
// (via buildContext) rather than re-implementing the same SQL inline, so
// there is exactly one implementation of each read. Mutations go through the
// MovementForm dialog, which calls the shared command client (record_movement).
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all"; // side-effect: registers every command/query
import { MovementForm } from "./movement-form";

type Sku = { id: string; name: string; products: { name: string } | null };
type Location = { id: string; name: string; kind: string };
type OnHandRow = { sku_id: string; location_id: string; qty: string };
type AtpRow = { sku_id: string; qty: string };
type Movement = {
  id: string;
  created_at: string;
  type: string;
  qty: string;
  sku_id: string;
  location_id: string;
  note: string | null;
};

function skuLabel(sku: Sku | undefined) {
  if (!sku) return "—";
  return sku.products?.name ? `${sku.products.name} — ${sku.name}` : sku.name;
}

export default async function InventoryPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const db = ctx.db;

  const [
    { data: skus, error: skusError },
    { data: locations, error: locationsError },
    onHand,
    atp,
    movements,
  ] = await Promise.all([
    db.from("skus").select("id, name, products(name)").eq("brewery_id", brewery.id).order("name"),
    db.from("locations").select("id, name, kind").eq("brewery_id", brewery.id).order("name"),
    runCommand("get_on_hand", {}, ctx) as Promise<OnHandRow[]>,
    runCommand("get_atp", {}, ctx) as Promise<AtpRow[]>,
    runCommand("list_movements", { limit: 50 }, ctx) as Promise<Movement[]>,
  ]);

  const error = skusError ?? locationsError;
  if (error) {
    return <p className="text-sm text-red-600">Failed to load inventory: {error.message}</p>;
  }

  const skuList = (skus as unknown as Sku[]) ?? [];
  const locationList = (locations as Location[]) ?? [];
  const skuById = new Map(skuList.map((s) => [s.id, s]));
  const locationById = new Map(locationList.map((l) => [l.id, l]));
  const atpBySku = new Map(atp.map((a) => [a.sku_id, a.qty]));
  const onHandRows = onHand ?? [];
  const movementRows = movements ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Inventory</h1>
        <MovementForm skus={skuList.map((s) => ({ id: s.id, label: skuLabel(s) }))} locations={locationList} />
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">On hand</h2>
        {onHandRows.length ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 font-normal">SKU</th>
                <th className="py-1 font-normal">Location</th>
                <th className="py-1 font-normal">On hand</th>
                <th className="py-1 font-normal">ATP</th>
              </tr>
            </thead>
            <tbody>
              {onHandRows.map((row) => (
                <tr key={`${row.sku_id}-${row.location_id}`} className="border-t">
                  <td className="py-1">{skuLabel(skuById.get(row.sku_id))}</td>
                  <td className="py-1">{locationById.get(row.location_id)?.name ?? "—"}</td>
                  <td className="py-1">{row.qty}</td>
                  <td className="py-1">{atpBySku.get(row.sku_id) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted-foreground">No inventory recorded yet.</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Movement log</h2>
        {movementRows.length ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 font-normal">When</th>
                <th className="py-1 font-normal">Type</th>
                <th className="py-1 font-normal">SKU</th>
                <th className="py-1 font-normal">Location</th>
                <th className="py-1 font-normal">Qty</th>
                <th className="py-1 font-normal">Note</th>
              </tr>
            </thead>
            <tbody>
              {movementRows.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="py-1">{new Date(m.created_at).toLocaleString()}</td>
                  <td className="py-1">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">{m.type}</span>
                  </td>
                  <td className="py-1">{skuLabel(skuById.get(m.sku_id))}</td>
                  <td className="py-1">{locationById.get(m.location_id)?.name ?? "—"}</td>
                  <td className={`py-1 ${Number(m.qty) < 0 ? "text-red-600" : "text-green-700"}`}>
                    {Number(m.qty) > 0 ? `+${m.qty}` : m.qty}
                  </td>
                  <td className="py-1 text-muted-foreground">{m.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted-foreground">No movements recorded yet.</p>
        )}
      </section>
    </div>
  );
}
