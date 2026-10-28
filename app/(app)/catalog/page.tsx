// app/(app)/catalog/page.tsx — Catalog (screen record): the brand list, then
// formats. A brand's name opens Brand (brands/[id]); its packages are one tap
// further, switched on and off under Brand's Sells as — Catalog no longer nests
// them. Add format opens format-form.tsx; a format's name links to its components and Package BOM.
// A brand, Price groups and Water profiles link only for a role whose page lets
// it in (canRun on the reads or write that page requires), never to No access.
// ?q=, ?sort= and ?category= narrow and order the brands in list_brands
// (docs/plans/list-filters.md); ListControls draws them as a GET form and
// labeled Sort and Category picks whose options are links (toCatalogScopes).
import { z } from "zod";
import { CatalogView } from "@/components/mgr/views/catalog";
import { toCatalogScopes, toCatalogViewProps, type CatalogBrandRow } from "@/lib/mgr/catalog-view";
import { toFormatsViewProps } from "@/lib/mgr/formats-view";
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { canRun } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { FormatForm } from "./format-form";
import { ListControls } from "@/components/mgr/list-controls";
import { listParams, searchQuery } from "@/lib/mgr/list-params";
import { BRAND_SORTS } from "@/lib/mgr/enums";
import { navTitle } from "@/lib/mgr/nav";
import { ColaReview } from "./cola-review";
import { ColaImage } from "./cola-image";

export const metadata = { title: navTitle("/catalog") };

type PriceGroup = { id: string; name: string };
type Sku = { id: string; name: string; format_id: string; active: boolean; upc: string | null };
type Brand = { id: string; name: string; alias: string | null; abv: number | null; description: string | null; category: string | null; price_group_id: string | null; hops: string | null; styles: { name: string } | null; skus: Sku[]; pours: { id: string }[]; colas: CatalogBrandRow["colas"] };
type Format = { id: string; name: string; basis: "packaged" | "poured"; package_type: string | null; keg_size: string | null; units_per_case: number | null; bbl_per_unit: string | null };

/** The reads app/(app)/pricing/page.tsx runs; a role must pass them all or it
 *  lands on No access. Keep in step with that page; tests/main214-page-assembly.test.ts
 *  fails when the two differ for any staff role. */
const PRICING_READS = ["list_sale_channels", "list_price_groups", "list_formats", "list_channel_prices", "list_price_group_barcodes"];

const catalogParams = z.object({
  q: searchQuery,
  sort: z.enum(BRAND_SORTS).catch("name"),
  category: z.string().trim().catch(""),
});

export default async function CatalogPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}) {
  const { params, queryWith, hrefWith } = listParams(catalogParams, (await searchParams) ?? {});
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const canWrite = brewery.roles.includes("admin") || brewery.roles.includes("sales");
  const [brands, formats, groups, categories] = await Promise.all([
    runCommand("list_brands", params, ctx) as Promise<Brand[]>, runCommand("list_formats", { basis: "packaged" }, ctx) as Promise<Format[]>, runCommand("list_price_groups", {}, ctx) as Promise<PriceGroup[]>,
    runCommand("list_catalog_categories", {}, ctx) as Promise<{ name: string }[]>,
  ]);
  // Each option links to this page with that one setting changed; the other params stay.
  const scopes = toCatalogScopes({ ...params, categories: categories.map(c => c.name), href: patch => hrefWith("/catalog", patch) });
  // The search form resubmits only q, so it carries every other non-default param along.
  const keep = Object.fromEntries(queryWith({ q: "" }));
  const controls = <ListControls search={{ label: "Search brands or aliases", value: params.q, keep }} scopes={scopes} />;
  const model = toCatalogViewProps({ brands, priceGroups: groups, backHref: "/more", filtered: Boolean(params.q || params.category) });
  return (
    <CatalogView
      model={model}
      colaAction={canWrite ? <ColaReview brands={brands} /> : null}
      images={Object.fromEntries(model.brands.flatMap(brand => brand.image ? [[brand.key, <ColaImage key={`${brand.key}:${brand.image.url}`} ttbId={brand.image.ttbId} url={brand.image.url} label={`${brand.name} · COLA ${brand.image.ttbId}`} compact />]] : []))}
      controls={controls}
      createAction={canWrite ? E.btn("New brand", "p", "/catalog/brands/new") : null}
      links={{
        brands: canRun(ctx, "upsert_brand"), // the brand page requires it
        priceGroups: PRICING_READS.every(name => canRun(ctx, name)),
        waterProfiles: canRun(ctx, "list_water_profiles"),
      }}
      formats={toFormatsViewProps({ formats, formatHref: format => `/catalog/formats/${format.id}` })}
      formatAction={canWrite ? <FormatForm componentOptions={formats.filter(format => format.bbl_per_unit !== null)} takenNames={formats.map(format => format.name)} /> : null}
    />
  );
}
