// app/(app)/catalog/brands/[id]/page.tsx — Brand (screen record): one brand's
// sellable facts on a full page, or a blank one at /catalog/brands/new. Admin
// and Sales only (whoever may upsert_brand); Catalog shows the links to nobody
// else. Reads
// list_brands, list_price_groups, the brand's approvals and registrations
// from get_compliance_registry, and its recipe cost (get_brand_recipe_cost)
// for the price-group suggestion. A saved brand also reads its Sells as:
// packaged list_formats (with contents), list_channel_prices,
// list_sale_channels and list_keg_pools (for the SKU sheet). brand-page.tsx
// binds the shared BrandView to upsert_brand, the Sells as switches to
// create_sku / update_sku (only for a role that may run create_sku), and
// slots the compliance and SKU sheets.
import { cache } from "react";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { canRun } from "@/lib/commands/registry";
import type { RegistryBrand } from "@/lib/commands/compliance";
import { optionalPageQuery, requirePagePermission, runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { notFound } from "next/navigation";
import "@/lib/commands/all";
import type { BrandSnapshot } from "@/lib/mgr/brand-view";
import type { KegPoolOption } from "@/lib/mgr/sku-view";
import { BrandPage, type BrandRow, type SellsReads } from "./brand-page";
import { navTitle } from "@/lib/mgr/nav";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getBrandPageData(id);
  return { title: navTitle(id === "new" ? "/catalog/brands/new" : "/catalog/brands") };
}

const getBrandPageData = cache(async function getBrandPageData(id: string) {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  // The page edits; whoever may not save a brand is sent to No access, not shown a read-only form.
  requirePagePermission(ctx, "upsert_brand", "Brand");
  const [brands, groups, registry, cost, categories, sells] = await Promise.all([
    runCommand("list_brands", {}, ctx) as Promise<BrandRow[]>,
    runCommand("list_price_groups", {}, ctx) as Promise<BrandSnapshot["priceGroups"]>,
    runCommand("get_compliance_registry", {}, ctx) as Promise<{ brands: RegistryBrand[] }>,
    // Enrichment: an unknown id fails validation and simply has no suggestion; the brand lookup below still 404s it.
    id === "new" ? undefined : optionalPageQuery<BrandSnapshot["cost"]>("get_brand_recipe_cost", { brandId: id }, ctx),
    runCommand("list_catalog_categories", {}, ctx) as Promise<{ name: string }[]>,
    // A new brand sells nothing until its first save.
    id === "new" ? undefined : Promise.all([
      runCommand("list_formats", { basis: "packaged" }, ctx) as Promise<SellsReads["formats"]>,
      runCommand("list_channel_prices", {}, ctx) as Promise<SellsReads["prices"]>,
      runCommand("list_sale_channels", {}, ctx) as Promise<SellsReads["channels"]>,
      runCommand("list_keg_pools", {}, ctx) as Promise<KegPoolOption[]>,
    ]),
  ]);
  const brand = id === "new" ? null : brands.find((b) => b.id === id) ?? notFound();
  const own = brand ? registry.brands.find((b) => b.id === brand.id) : undefined;
  return { ctx, brands, groups, cost, categories, sells, brand, own };
});

export default async function BrandDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, brands, groups, cost, categories, sells, brand, own } = await getBrandPageData(id);
  return (
    <BrandPage
      brand={brand}
      categories={categories.map(category => category.name)}
      styles={[...new Set(brands.map((b) => b.styles?.name).filter((s): s is string => !!s))]}
      priceGroups={groups}
      cost={cost}
      compliance={own}
      sells={sells && { formats: sells[0], prices: sells[1], channels: sells[2] }}
      pools={sells?.[3] ?? []}
      canSell={canRun(ctx, "create_sku")}
    />
  );
}
