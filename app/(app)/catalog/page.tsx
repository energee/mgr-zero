// app/(app)/catalog/page.tsx — Catalog (screen record): the brand list, then
// formats. A brand row opens Brand (brands/[id]); its packages are one tap
// further, on Brand's SKU list row (brands/[id]/skus) — Catalog no longer nests
// them. Packaged and poured SKUs are managed together under each brand. Add format
// opens format-form.tsx; Open format links to its components and Package BOM.
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

type PriceGroup = { id: string; name: string };
type Sku = { id: string; name: string; format_id: string; active: boolean; upc: string | null };
type Brand = { id: string; name: string; abv: number | null; description: string | null; category: string | null; price_group_id: string | null; hops: string | null; styles: { name: string } | null; skus: Sku[]; pours: { id: string }[] };
type Format = { id: string; name: string; basis: "packaged" | "poured"; package_type: string | null; keg_size: string | null; units_per_case: number | null; bbl_per_unit: string | null };

const SORTS = [["name", "Name"], ["abv", "ABV"], ["newest", "Newest"]] as const;
const catalogParams = z.object({
  q: z.string().trim().max(100).catch(""),
  sort: z.enum(["name", "abv", "newest"]).catch("name"),
  category: z.string().trim().catch(""),
});

export default async function CatalogPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}) {
  const { params, hrefWith } = listParams(catalogParams, (await searchParams) ?? {});
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const canWrite = brewery.role === "admin" || brewery.role === "sales";
  const [brands, formats, groups, categories] = await Promise.all([
    runCommand("list_brands", { q: params.q || undefined, sort: params.sort, category: params.category || undefined }, ctx) as Promise<Brand[]>, runCommand("list_formats", { basis: "packaged" }, ctx) as Promise<Format[]>, runCommand("list_price_groups", {}, ctx) as Promise<PriceGroup[]>,
    runCommand("list_catalog_categories", {}, ctx) as Promise<{ name: string }[]>,
  ]);
  // Each tab links to this page with that one choice changed; the other params stay.
  const sortRow = {
    label: "Sort", names: SORTS.map(([, label]) => label),
    on: SORTS.findIndex(([value]) => value === params.sort),
    hrefs: Object.fromEntries(SORTS.map(([value, label]) => [label, hrefWith("/catalog", { sort: value })])),
  };
  const categoryNames = ["All", ...categories.map(c => c.name)];
  const categoryRow = {
    label: "Category", names: categoryNames,
    on: Math.max(0, categoryNames.indexOf(params.category)),
    hrefs: Object.fromEntries(categoryNames.map(name => [name, hrefWith("/catalog", { category: name === "All" ? "" : name })])),
  };
  // The search form resubmits only q, so it carries a non-default sort and category along.
  const keep = { ...(params.sort !== "name" && { sort: params.sort }), ...(params.category && { category: params.category }) };
  const controls = <ListControls search={{ label: "Search brands", value: params.q, keep }} rows={categories.length ? [sortRow, categoryRow] : [sortRow]} />;
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
