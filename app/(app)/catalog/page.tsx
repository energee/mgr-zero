// app/(app)/catalog/page.tsx — products + SKUs catalog. Reads through the
// command registry (list_products) with a brewery-scoped Ctx, so scoping is
// enforced once in buildContext rather than per page. Failures throw to the
// (app) error boundary.
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { ProductForm } from "./product-form";
import { SkuForm } from "./sku-form";

type Sku = { id: string; name: string; package_type: string; bbl_per_unit: string };
type Product = { id: string; name: string; style: string | null; abv: number | null; skus: Sku[] };

export default async function CatalogPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const products = (await runCommand("list_products", {}, ctx)) as Product[];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Catalog</h1>
        <ProductForm />
      </div>

      {products.length ? (
        <div className="flex flex-col gap-4">
          {products.map((product) => (
            <div key={product.id} className="rounded border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{product.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {product.style ?? "—"} {product.abv != null ? `· ${product.abv}% ABV` : ""}
                  </div>
                </div>
                <SkuForm productId={product.id} />
              </div>

              {product.skus?.length ? (
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="py-1 font-normal">SKU</th>
                      <th className="py-1 font-normal">Package</th>
                      <th className="py-1 font-normal">BBL / unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {product.skus.map((sku) => (
                      <tr key={sku.id} className="border-t">
                        <td className="py-1">{sku.name}</td>
                        <td className="py-1">{sku.package_type}</td>
                        <td className="py-1">{sku.bbl_per_unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No SKUs yet.</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No products yet.</p>
      )}
    </div>
  );
}
