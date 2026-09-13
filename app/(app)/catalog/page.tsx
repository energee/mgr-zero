// app/(app)/catalog/page.tsx — Catalog (screen record): the brand list, then
// formats. A brand row opens Brand (brands/[id]); its packages are one tap
// further, on Brand's SKU list row (brands/[id]/skus) — Catalog no longer nests
// them. Brand-owned pours are created and edited beside their brand here,
// because a poured format belongs to one brand and is never a SKU. Add format
// opens format-form.tsx; Open format links to its components and Package BOM.
import { CatalogView } from "@/components/mgr/views/catalog";
import { FormatsView } from "@/components/mgr/views/formats";
import { toCatalogViewProps } from "@/lib/mgr/catalog-view";
import { toFormatsViewProps } from "@/lib/mgr/formats-view";
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { PourForm } from "./pour-form";
import { FormatForm } from "./format-form";

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
  return (
    <CatalogView
      model={toCatalogViewProps({ brands, priceGroups: groups, backHref: "/more" })}
      createAction={canWrite ? E.btn("New Brand", "p", "/catalog/brands/new") : null}
      linkRows
      rowExtra={(row) => {
        const brand = brands.find((b) => b.id === row.key)!;
        const pours = formats.filter((f) => f.brand_id === brand.id);
        return (
          <>
            {pours.map((f) => <div key={f.id}>{E.row(`${brand.name} · ${f.name}`, `${f.ounces} oz · poured`, canWrite ? <PourForm key={`${f.id}-${f.name}-${f.ounces}`} brand={brand} pour={{ id: f.id, name: f.name, ounces: f.ounces! }} /> : undefined)}</div>)}
            {canWrite ? E.row(`${brand.name} · pours`, "a glass served at the taproom, never a SKU", <PourForm brand={brand} />) : null}
          </>
        );
      }}
      footer={
        <FormatsView
          model={toFormatsViewProps({
            formats,
            formatHref: (format) => format.basis === "packaged" ? `/catalog/formats/${format.id}` : undefined,
          })}
          header={E.hd("Formats", "package composition", canWrite ? <FormatForm /> : undefined)}
        />
      }
    />
  );
}
