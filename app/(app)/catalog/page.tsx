// app/(app)/catalog/page.tsx — brands, their SKUs, and formats. Reads through
// the command registry (list_brands, list_formats) with a brewery-scoped Ctx,
// so scoping is enforced once in buildContext rather than per page. A SKU is
// one brand × one packaged format; bbl per unit lives on the format. Failures
// throw to the (app) error boundary.
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import { formatVolume } from "@/lib/volume";
import "@/lib/commands/all";
import { BrandForm } from "./brand-form";
import { FormatForm } from "./format-form";
import { SkuForm, type FormatOption } from "./sku-form";

type Sku = { id: string; name: string; format_id: string; active: boolean };
type Brand = { id: string; name: string; abv: number | null; styles: { name: string } | null; skus: Sku[] };
type Format = {
  id: string; name: string; basis: "packaged" | "poured"; package_type: string | null; keg_size: string | null;
  units_per_case: number | null; bbl_per_unit: string | null;
};

export default async function CatalogPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [brands, formats] = await Promise.all([
    runCommand("list_brands", {}, ctx) as Promise<Brand[]>,
    runCommand("list_formats", {}, ctx) as Promise<Format[]>,
  ]);
  const formatById = new Map(formats.map((f) => [f.id, f]));
  const packaged: FormatOption[] = formats.filter((f) => f.basis === "packaged").map((f) => ({ id: f.id, name: f.name }));

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Catalog</h1>
          <BrandForm />
        </div>

        {brands.length ? (
          brands.map((brand) => (
            <div key={brand.id} className="rounded border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{brand.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {brand.styles?.name ?? "—"} {brand.abv != null ? `· ${brand.abv}% ABV` : ""}
                  </div>
                </div>
                <SkuForm brandId={brand.id} formats={packaged} />
              </div>

              {brand.skus?.length ? (
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="py-1 font-normal">SKU</th>
                      <th className="py-1 font-normal">Format</th>
                      <th className="py-1 font-normal">Volume</th>
                    </tr>
                  </thead>
                  <tbody>
                    {brand.skus.map((sku) => {
                      const format = formatById.get(sku.format_id);
                      return (
                        <tr key={sku.id} className="border-t">
                          <td className="py-1">{sku.name}</td>
                          <td className="py-1">{format?.name ?? "—"}</td>
                          <td className="py-1">{format?.bbl_per_unit ? formatVolume(format.bbl_per_unit) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No SKUs yet.</p>
              )}
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No brands yet.</p>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Formats</h2>
          <FormatForm />
        </div>
        {formats.length ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 font-normal">Format</th>
                <th className="py-1 font-normal">Basis</th>
                <th className="py-1 font-normal">Package</th>
                <th className="py-1 font-normal">Units per case</th>
                <th className="py-1 font-normal">Volume</th>
              </tr>
            </thead>
            <tbody>
              {formats.map((f) => (
                <tr key={f.id} className="border-t">
                  <td className="py-1">{f.name}</td>
                  <td className="py-1">{f.basis}</td>
                  <td className="py-1">{f.package_type ? `${f.package_type}${f.keg_size ? ` (${f.keg_size.replace(/_/g, " ")})` : ""}` : "—"}</td>
                  <td className="py-1">{f.units_per_case ?? "—"}</td>
                  <td className="py-1">{f.bbl_per_unit ? formatVolume(f.bbl_per_unit) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted-foreground">No formats yet.</p>
        )}
      </section>
    </div>
  );
}
