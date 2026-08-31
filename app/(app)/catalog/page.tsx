// app/(app)/catalog/page.tsx — products + SKUs catalog. Server-rendered from
// Supabase, explicitly scoped to the active brewery (getActiveBrewery +
// .eq("brewery_id", ...)): RLS alone isn't enough here because a user who is
// staff at two breweries would otherwise see a merged view of both under one
// brewery's header. Mutations go through the ProductForm/SkuForm client
// dialogs, which call the shared command client.
import { createServerClient } from "@/lib/supabase/server";
import { getActiveBrewery } from "@/lib/brewery";
import { ProductForm } from "./product-form";
import { SkuForm } from "./sku-form";

type Sku = {
  id: string;
  name: string;
  package_type: string;
  bbl_per_unit: string;
};

type Product = {
  id: string;
  name: string;
  style: string | null;
  abv: number | null;
  skus: Sku[];
};

export default async function CatalogPage() {
  const brewery = await getActiveBrewery();
  const db = await createServerClient();
  const { data: products, error } = await db
    .from("products")
    .select("*, skus(*)")
    .eq("brewery_id", brewery.id)
    .order("name");

  if (error) {
    return <p className="text-sm text-red-600">Failed to load catalog: {error.message}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Catalog</h1>
        <ProductForm />
      </div>

      {(products as Product[] | null)?.length ? (
        <div className="flex flex-col gap-4">
          {(products as Product[]).map((product) => (
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
