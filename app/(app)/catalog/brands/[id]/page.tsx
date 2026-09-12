// app/(app)/catalog/brands/[id]/page.tsx — Brand (screen record): one brand's
// sellable facts on a full page, or a blank one at /catalog/brands/new. Reads
// list_brands, list_price_groups and the brand's COLA row from
// get_compliance_registry; brand-page.tsx binds the shared BrandView to
// upsert_brand.
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import type { RegistryBrand } from "@/lib/commands/compliance";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { notFound } from "next/navigation";
import "@/lib/commands/all";
import { BrandPage, type BrandRow } from "./brand-page";

export default async function BrandDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [brands, groups, registry] = await Promise.all([
    runCommand("list_brands", {}, ctx) as Promise<BrandRow[]>,
    runCommand("list_price_groups", {}, ctx) as Promise<{ id: string; name: string }[]>,
    runCommand("get_compliance_registry", {}, ctx) as Promise<{ brands: RegistryBrand[] }>,
  ]);
  const brand = id === "new" ? null : brands.find((b) => b.id === id) ?? notFound();
  const cola = brand ? registry.brands.find((b) => b.id === brand.id)?.approvals.find((a) => a.kind === "cola") ?? null : null;
  return (
    <BrandPage
      brand={brand}
      styles={[...new Set(brands.map((b) => b.styles?.name).filter((s): s is string => !!s))]}
      priceGroups={groups}
      cola={cola ? { number: cola.ttb_id } : null}
      writable={brewery.role === "admin" || brewery.role === "sales"}
    />
  );
}
