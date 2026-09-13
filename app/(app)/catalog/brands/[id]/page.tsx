// app/(app)/catalog/brands/[id]/page.tsx — Brand (screen record): one brand's
// sellable facts on a full page, or a blank one at /catalog/brands/new. Admin
// and Sales only: the compliance read gates the page, and Catalog shows the
// links to nobody else. Reads
// list_brands, list_price_groups, the brand's approvals and registrations
// from get_compliance_registry, and its recipe cost (get_brand_recipe_cost)
// for the price-group suggestion; brand-page.tsx binds the shared BrandView
// to upsert_brand and slots the two compliance sheets.
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import type { RegistryBrand } from "@/lib/commands/compliance";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { notFound } from "next/navigation";
import "@/lib/commands/all";
import type { BrandSnapshot } from "@/lib/mgr/brand-view";
import { BrandPage, type BrandRow } from "./brand-page";

export default async function BrandDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [brands, groups, registry] = await Promise.all([
    runCommand("list_brands", {}, ctx) as Promise<BrandRow[]>,
    runCommand("list_price_groups", {}, ctx) as Promise<BrandSnapshot["priceGroups"]>,
    runCommand("get_compliance_registry", {}, ctx) as Promise<{ brands: RegistryBrand[] }>,
  ]);
  const brand = id === "new" ? null : brands.find((b) => b.id === id) ?? notFound();
  const own = brand ? registry.brands.find((b) => b.id === brand.id) : undefined;
  // Enrichment only: a failed cost read leaves the suggestion off, never the page.
  const cost = brand ? await runCommand("get_brand_recipe_cost", { brandId: brand.id }, ctx).then((c) => c as BrandSnapshot["cost"], (e) => { console.error("get_brand_recipe_cost", brand.id, e); return undefined; }) : undefined;
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
