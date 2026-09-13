// app/(app)/catalog/brands/[id]/page.tsx — Brand (screen record): one brand's
// sellable facts on a full page, or a blank one at /catalog/brands/new. Admin
// and Sales only (whoever may upsert_brand); Catalog shows the links to nobody
// else. Reads
// list_brands, list_price_groups, the brand's approvals and registrations
// from get_compliance_registry, and its recipe cost (get_brand_recipe_cost)
// for the price-group suggestion; brand-page.tsx binds the shared BrandView
// to upsert_brand and slots the two compliance sheets.
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import type { RegistryBrand } from "@/lib/commands/compliance";
import { optionalPageQuery, requirePagePermission, runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { notFound } from "next/navigation";
import "@/lib/commands/all";
import type { BrandSnapshot } from "@/lib/mgr/brand-view";
import { BrandPage, type BrandRow } from "./brand-page";

export default async function BrandDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  // The page edits; whoever may not save a brand is sent to No access, not shown a read-only form.
  requirePagePermission(ctx, "upsert_brand", "Brand");
  const [brands, groups, registry, cost] = await Promise.all([
    runCommand("list_brands", {}, ctx) as Promise<BrandRow[]>,
    runCommand("list_price_groups", {}, ctx) as Promise<BrandSnapshot["priceGroups"]>,
    runCommand("get_compliance_registry", {}, ctx) as Promise<{ brands: RegistryBrand[] }>,
    // Enrichment: an unknown id fails validation and simply has no suggestion; the brand lookup below still 404s it.
    id === "new" ? undefined : optionalPageQuery<BrandSnapshot["cost"]>("get_brand_recipe_cost", { brandId: id }, ctx),
  ]);
  const brand = id === "new" ? null : brands.find((b) => b.id === id) ?? notFound();
  const own = brand ? registry.brands.find((b) => b.id === brand.id) : undefined;
  return (
    <BrandPage
      brand={brand}
      styles={[...new Set(brands.map((b) => b.styles?.name).filter((s): s is string => !!s))]}
      priceGroups={groups}
      cost={cost}
      compliance={own}
    />
  );
}
