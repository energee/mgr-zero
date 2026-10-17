// app/(app)/catalog/page.tsx — Catalog (screen record): the brand list, then
// formats. A brand's name opens Brand (brands/[id]); its packages are one tap
// further, on Brand's SKU list row (brands/[id]/skus) — Catalog no longer nests
// them. Packaged and poured SKUs are managed together under each brand. Add format
// opens format-form.tsx; a format's name links to its components and Package BOM.
// ?q=, ?sort= and ?category= narrow and order the brands in list_brands
// (docs/plans/list-filters.md); ListControls draws them as a GET form and link tabs.
import { z } from "zod";
import { CatalogView } from "@/components/mgr/views/catalog";
import { toCatalogViewProps } from "@/lib/mgr/catalog-view";
import { toFormatsViewProps } from "@/lib/mgr/formats-view";
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { FormatForm } from "./format-form";
import { ListControls } from "@/components/mgr/list-controls";
import { listParams } from "@/lib/mgr/list-params";
import { BRAND_SORTS } from "@/lib/mgr/enums";
import { BRAND_SORT_LABEL } from "@/lib/mgr/labels";

type PriceGroup = { id: string; name: string };
type Sku = { id: string; name: string; format_id: string; active: boolean; upc: string | null };
type Brand = { id: string; name: string; alias: string | null; abv: number | null; description: string | null; category: string | null; price_group_id: string | null; hops: string | null; styles: { name: string } | null; skus: Sku[]; pours: { id: string }[] };
type Format = { id: string; name: string; basis: "packaged" | "poured"; package_type: string | null; keg_size: string | null; units_per_case: number | null; bbl_per_unit: string | null };

const catalogParams = z.object({
  q: z.string().trim().max(100).catch(""),
  sort: z.enum(BRAND_SORTS).catch("name"),
  category: z.string().trim().catch(""),
});

export default async function CatalogPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}) {
  const { params, queryWith, hrefWith } = listParams(catalogParams, (await searchParams) ?? {});
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const canWrite = brewery.role === "admin" || brewery.role === "sales";
  const [brands, formats, groups, categories] = await Promise.all([
    runCommand("list_brands", params, ctx) as Promise<Brand[]>, runCommand("list_formats", { basis: "packaged" }, ctx) as Promise<Format[]>, runCommand("list_price_groups", {}, ctx) as Promise<PriceGroup[]>,
    runCommand("list_catalog_categories", {}, ctx) as Promise<{ name: string }[]>,
  ]);
  // Each tab links to this page with that one choice changed; the other params stay.
  const sortRow = {
    label: "Sort", names: BRAND_SORTS.map(value => BRAND_SORT_LABEL[value]),
    on: BRAND_SORTS.indexOf(params.sort),
    hrefs: Object.fromEntries(BRAND_SORTS.map(value => [BRAND_SORT_LABEL[value], hrefWith("/catalog", { sort: value })])),
  };
  const categoryNames = ["All", ...categories.map(c => c.name)];
  const categoryRow = {
    label: "Category", names: categoryNames,
    on: Math.max(0, categoryNames.indexOf(params.category)),
    hrefs: Object.fromEntries(categoryNames.map(name => [name, hrefWith("/catalog", { category: name === "All" ? "" : name })])),
  };
  // The search form resubmits only q, so it carries every other non-default param along.
  const keep = Object.fromEntries(queryWith({ q: "" }));
  const controls = <ListControls search={{ label: "Search brands or aliases", value: params.q, keep }} rows={categories.length ? [sortRow, categoryRow] : [sortRow]} />;
  return (
    <CatalogView
      model={toCatalogViewProps({ brands, priceGroups: groups, backHref: "/more", filtered: Boolean(params.q || params.category) })}
      controls={controls}
      createAction={canWrite ? E.btn("New Brand", "p", "/catalog/brands/new") : null}
      linkRows
      formats={toFormatsViewProps({ formats, formatHref: format => `/catalog/formats/${format.id}` })}
      formatAction={canWrite ? <FormatForm componentOptions={formats.filter(format => format.bbl_per_unit !== null)} /> : null}
      footer={<>
        {E.nav("Water profiles", "the water you start from and the waters you aim at", "", undefined, "/catalog/water-profiles")}
      </>}
    />
  );
}
