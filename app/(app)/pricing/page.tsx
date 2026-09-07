// app/(app)/pricing/page.tsx — price groups (§16.4): each group prices formats
// by default and overrides per SKU. Reads through the command registry
// (list_price_lists, list_skus, list_formats, list_sale_channels). Every list
// prices for one sale channel, shown beside its name. Failures throw to the (app)
// error boundary.
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { money } from "@/lib/mgr/money";
import { PriceListForm, type PriceListChannel } from "./price-list-form";
import { PriceForm } from "./price-form";
import { PriceFormatForm } from "./price-format-form";
import { ClearOverrideButton } from "./clear-override-button";

type Sku = { id: string; name: string; brands: { name: string } | null };
type PriceListItem = { sku_id: string; unit_price_cents: number; skus: { name: string } | null };
type PriceListFormat = { format_id: string; unit_price_cents: number; formats: { name: string } | null };
type PriceList = { id: string; name: string; channel_id: string; sale_channels: { name: string } | null; price_list_formats: PriceListFormat[]; price_list_items: PriceListItem[] };
type Format = { id: string; name: string; basis: string };

function skuLabel(sku: Sku | undefined) {
  if (!sku) return "—";
  return sku.brands?.name ? `${sku.brands.name} — ${sku.name}` : sku.name;
}


export default async function PricingPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [priceLists, skus, formats, channels] = (await Promise.all([
    runCommand("list_price_lists", {}, ctx),
    runCommand("list_skus", {}, ctx),
    runCommand("list_formats", { basis: "packaged" }, ctx),
    runCommand("list_sale_channels", {}, ctx),
  ])) as [PriceList[], Sku[], Format[], PriceListChannel[]];

  const skuOptions = skus.map((s) => ({ id: s.id, label: skuLabel(s) }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Pricing</h1>
        <PriceListForm channels={channels} />
      </div>

      {priceLists.length ? (
        <div className="flex flex-col gap-4">
          {priceLists.map((list) => (
            <div key={list.id} className="rounded border p-4">
              <div className="flex items-center justify-between">
                <div className="font-medium">
                  {list.name}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">{list.sale_channels?.name ?? "—"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <PriceListForm priceList={{ id: list.id, name: list.name, channelId: list.channel_id }} channels={channels} />
                  <PriceFormatForm priceListId={list.id} formats={formats} />
                  <PriceForm priceListId={list.id} skus={skuOptions} />
                </div>
              </div>

              {list.price_list_formats?.length ? (
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="py-1 font-normal">Format default</th>
                      <th className="py-1 font-normal">Unit price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.price_list_formats.map((row) => (
                      <tr key={row.format_id} className="border-t">
                        <td className="py-1">{row.formats?.name ?? "—"}</td>
                        <td className="py-1">{money(row.unit_price_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No format prices yet.</p>
              )}
              {list.price_list_items?.length ? (
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="py-1 font-normal">SKU override</th>
                      <th className="py-1 font-normal">Unit price</th>
                      <th className="py-1 font-normal"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.price_list_items.map((item) => (
                      <tr key={item.sku_id} className="border-t">
                        <td className="py-1">{item.skus?.name ?? "—"}</td>
                        <td className="py-1">{money(item.unit_price_cents)}</td>
                        <td className="py-1 text-right"><ClearOverrideButton priceListId={list.id} skuId={item.sku_id} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No price groups yet.</p>
      )}
    </div>
  );
}
