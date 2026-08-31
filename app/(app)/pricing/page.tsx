// app/(app)/pricing/page.tsx — price lists + their per-SKU prices. Reads
// through the command registry (list_price_lists, list_skus) with a
// brewery-scoped Ctx. Failures throw to the (app) error boundary.
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { PriceListForm } from "./price-list-form";
import { PriceForm } from "./price-form";

type Sku = { id: string; name: string; products: { name: string } | null };
type PriceListItem = { sku_id: string; unit_price_cents: number; skus: { name: string } | null };
type PriceList = { id: string; name: string; price_list_items: PriceListItem[] };

function skuLabel(sku: Sku | undefined) {
  if (!sku) return "—";
  return sku.products?.name ? `${sku.products.name} — ${sku.name}` : sku.name;
}

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function PricingPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [priceLists, skus] = (await Promise.all([
    runCommand("list_price_lists", {}, ctx),
    runCommand("list_skus", {}, ctx),
  ])) as [PriceList[], Sku[]];

  const skuById = new Map(skus.map((s) => [s.id, s]));
  const skuOptions = skus.map((s) => ({ id: s.id, label: skuLabel(s) }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Pricing</h1>
        <PriceListForm />
      </div>

      {priceLists.length ? (
        <div className="flex flex-col gap-4">
          {priceLists.map((list) => (
            <div key={list.id} className="rounded border p-4">
              <div className="flex items-center justify-between">
                <div className="font-medium">{list.name}</div>
                <PriceForm priceListId={list.id} skus={skuOptions} />
              </div>

              {list.price_list_items?.length ? (
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="py-1 font-normal">SKU</th>
                      <th className="py-1 font-normal">Unit price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.price_list_items.map((item) => (
                      <tr key={item.sku_id} className="border-t">
                        <td className="py-1">{item.skus?.name ?? skuLabel(skuById.get(item.sku_id))}</td>
                        <td className="py-1">{formatCents(item.unit_price_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No prices set yet.</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No price lists yet.</p>
      )}
    </div>
  );
}
