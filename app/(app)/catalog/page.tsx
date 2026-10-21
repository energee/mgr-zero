// app/(app)/catalog/page.tsx — Catalog (screen record): the brand list, then
// formats. A brand's name opens Brand (brands/[id]); its packages are one tap
// further, on Brand's SKU list row (brands/[id]/skus) — Catalog no longer nests
// them. Packaged and poured SKUs are managed together under each brand. Add format
// opens format-form.tsx; a format's name links to its components and Package BOM.
// ?q=, ?sort= and ?category= narrow and order the brands in list_brands
// (docs/plans/list-filters.md); ListControls draws them as a GET form and
// labeled Sort and Category picks whose options are links (toCatalogScopes).
import { z } from "zod";
import { CatalogView } from "@/components/mgr/views/catalog";
import { toCatalogScopes, toCatalogViewProps } from "@/lib/mgr/catalog-view";
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

type PriceGroup = { id: string; name: string };
type Sku = { id: string; name: string; format_id: string; active: boolean; upc: string | null };
type Brand = { id: string; name: string; alias: string | null; abv: number | null; description: string | null; category: string | null; price_group_id: string | null; hops: string | null; styles: { name: string } | null; skus: Sku[]; pours: { id: string }[]; colas: { ttb_id: string; approved_on: string | null }[] };
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
  return (
    <CatalogView
      model={toCatalogViewProps({ brands, priceGroups: groups, backHref: "/more", filtered: Boolean(params.q || params.category) })}
      controls={controls}
      createAction={canWrite ? E.btn("New brand", "p", "/catalog/brands/new") : null}
      linkRows
      formats={toFormatsViewProps({ formats, formatHref: format => `/catalog/formats/${format.id}` })}
      formatAction={canWrite ? <FormatForm componentOptions={formats.filter(format => format.bbl_per_unit !== null)} /> : null}
    />
  );
}
