// app/(app)/catalog/page.tsx — Catalog (screen record): brands with their
// SKUs, then formats. Add brand opens brand-form.tsx (Brand), Add SKU on a
// brand opens sku-form.tsx (SKU), Add format opens format-form.tsx. Open format
// links to its components and Package BOM. A SKU is one brand × one packaged
// format; bbl per unit lives on the format.
import { CatalogView } from "@/components/mgr/views/catalog";
import { toCatalogViewProps } from "@/lib/mgr/catalog-view";
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { plural } from "@/lib/mgr/plural";
import { formatVolume } from "@/lib/volume";
import "@/lib/commands/all";
import { BrandForm } from "./brand-form";
import { PourForm } from "./pour-form";
import { FormatForm } from "./format-form";
import { SkuForm, SkuEditForm, type FormatOption } from "./sku-form";

type PriceGroup = { id: string; name: string };
type Sku = { id: string; name: string; format_id: string; active: boolean; upc: string | null };
type Brand = { id: string; name: string; abv: number | null; description: string | null; category: string | null; price_group_id: string | null; hops: string | null; styles: { name: string } | null; skus: Sku[] };
type Format = { brand_id: string | null; ounces: number | null; brands: { name: string } | null; id: string; name: string; basis: "packaged" | "poured"; package_type: string | null; keg_size: string | null; units_per_case: number | null; bbl_per_unit: string | null };

export default async function CatalogPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const canWrite = brewery.role === "admin" || brewery.role === "sales";
  const [brands, formats, groups] = await Promise.all([
    runCommand("list_brands", {}, ctx) as Promise<Brand[]>, runCommand("list_formats", {}, ctx) as Promise<Format[]>, runCommand("list_price_groups", {}, ctx) as Promise<PriceGroup[]>,
  ]);
  const formatById = new Map(formats.map((f) => [f.id, f]));
  const packaged: FormatOption[] = formats.filter((f) => f.basis === "packaged").map((f) => ({ id: f.id, name: f.name }));
  return (
    <CatalogView
      model={toCatalogViewProps({ brands, priceGroups: groups, backHref: "/more" })}
      createAction={canWrite ? <BrandForm groups={groups} /> : null}
      linkRows
      brands={brands.length === 0 ? E.blank("No brands yet") : brands.map((brand) => (
        <div key={brand.id}>
          {E.row(brand.name, `${brand.styles?.name ?? "style not set"}${brand.abv != null ? ` · ${brand.abv}% ABV` : ""} · ${plural(brand.skus.length, "SKU")}`,
            canWrite ? <div className="flex max-w-44 flex-wrap gap-2 md:max-w-none"><BrandForm key={JSON.stringify(brand)} groups={groups} brand={{ id: brand.id, name: brand.name, style: brand.styles?.name ?? null, abv: brand.abv, description: brand.description, category: brand.category, priceGroupId: brand.price_group_id, hops: brand.hops }} /><SkuForm brandId={brand.id} formats={packaged} /><PourForm brand={brand} /></div> : undefined, "", undefined,
            brand.skus.length ? brand.skus.map((sku) => {
              const f = formatById.get(sku.format_id);
              return <div key={sku.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{sku.name} · {sku.active ? "Active" : "Inactive"}{sku.upc ? ` · UPC ${sku.upc}` : ""}</span><span className="text-muted-foreground">{f?.name ?? "—"}{f?.bbl_per_unit ? ` · ${formatVolume(f.bbl_per_unit)}` : ""}</span>{canWrite && <SkuEditForm sku={sku} formatName={f?.name ?? "—"} />}</div>;
            }) : undefined)}
          {formats.filter((f) => f.brand_id === brand.id).map((f) => <div key={f.id}>{E.row(`${brand.name} · ${f.name}`, `${f.ounces} oz · poured`, canWrite ? <PourForm key={`${f.id}-${f.name}-${f.ounces}`} brand={brand} pour={{ id: f.id, name: f.name, ounces: f.ounces! }} /> : undefined)}</div>)}
        </div>
      ))}
      footer={<>
        {E.hd("Formats", "package composition", canWrite ? <FormatForm /> : undefined)}
        {packaged.length === 0 ? E.blank("No formats yet") : formats.filter((f) => f.basis === "packaged").map((f) => (
          <div key={f.id}>{E.row(f.name, `${f.basis}${f.package_type ? ` · ${f.package_type}${f.keg_size ? ` (${f.keg_size.replace(/_/g, " ")})` : ""}` : ""}${f.units_per_case ? ` · ${f.units_per_case} per case` : ""}${f.bbl_per_unit ? ` · ${formatVolume(f.bbl_per_unit)}` : ""}`, E.act("Open format", "primary", `/catalog/formats/${f.id}`))}</div>
        ))}
      </>}
    />
  );
}
