// app/(app)/inventory/page.tsx — on-hand/ATP inventory + movement log. All
// reads go through the command registry with a brewery-scoped Ctx (one
// implementation of each read, shared with the future AI surface). Failures
// throw to the (app) error boundary.
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { MovementForm } from "./movement-form";

type Sku = { id: string; name: string; products: { name: string } | null };
type Location = { id: string; name: string; kind: string };
type OnHandRow = { sku_id: string; location_id: string; qty: string };
type AtpRow = { sku_id: string; qty: string };
type Movement = { id: string; created_at: string; type: string; qty: string; sku_id: string; location_id: string; note: string | null };

function skuLabel(sku: Sku | undefined) {
  if (!sku) return "—";
  return sku.products?.name ? `${sku.products.name} — ${sku.name}` : sku.name;
}

export default async function InventoryPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [skus, locations, onHand, atp, movements] = (await Promise.all([
    runCommand("list_skus", {}, ctx),
    runCommand("list_locations", {}, ctx),
    runCommand("get_on_hand", {}, ctx),
    runCommand("get_atp", {}, ctx),
    runCommand("list_movements", { limit: 50 }, ctx),
  ])) as [Sku[], Location[], OnHandRow[], AtpRow[], Movement[]];

  const skuById = new Map(skus.map((s) => [s.id, s]));
  const locationName = (id: string) => locations.find((l) => l.id === id)?.name ?? "—";
  const atpBySku = new Map(atp.map((a) => [a.sku_id, a.qty]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Inventory</h1>
        <MovementForm skus={skus.map((s) => ({ id: s.id, label: skuLabel(s) }))} locations={locations} />
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">On hand</h2>
        {onHand.length ? (
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
              {onHand.map((row) => (
                <tr key={`${row.sku_id}-${row.location_id}`} className="border-t">
                  <td className="py-1">{skuLabel(skuById.get(row.sku_id))}</td>
                  <td className="py-1">{locationName(row.location_id)}</td>
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
        {movements.length ? (
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
              {movements.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="py-1">{new Date(m.created_at).toLocaleString()}</td>
                  <td className="py-1">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">{m.type}</span>
                  </td>
                  <td className="py-1">{skuLabel(skuById.get(m.sku_id))}</td>
                  <td className="py-1">{locationName(m.location_id)}</td>
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
