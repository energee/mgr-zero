// One brand’s sellable SKUs: stocked packages and the price group's pours. Each row
// names its barcode, its own UPC or its price group’s (list_price_group_barcodes).
// Kept for old links: packages are switched on under the Brand page's Sells as,
// so there is no New SKU here, and the back link lands on that section.
// Existing serving identities remain the boundary for poured POS activity.
import { cache } from "react";
import type { KegPoolOption } from "@/lib/mgr/sku-view";
import type { PriceGroupBarcode } from "@/lib/mgr/price-groups-view";
import { notFound } from "next/navigation";
import { SkuListView } from "@/components/mgr/views/sku-list";
import { toSkuListViewProps } from "@/lib/mgr/sku-list-view";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { canRun } from "@/lib/commands/registry";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { PourForm } from "../../../pour-form";
import { SkuEditForm } from "../../../sku-form";
import { navTitle } from "@/lib/mgr/nav";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getSkuListPageData(id);
  return { title: navTitle("/catalog/brands") };
}

type Sku = { id: string; name: string; format_id: string; active: boolean; upc: string | null; keg_pool_id: string | null; batch_share: number | string | null };
type Brand = { id: string; name: string; price_group_id: string | null; price_groups: { name: string } | null; skus: Sku[]; pours: { id: string; name: string; ounces: number }[] };
type Format = { package_type: string | null; id: string; name: string; bbl_per_unit: string | null; effective_bbl_per_unit: string | number | null };

const getSkuListPageData = cache(async function getSkuListPageData(id: string) {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const canWrite = brewery.roles.includes("admin") || brewery.roles.includes("sales");
  const [brands, formats, pools, barcodes] = await Promise.all([
    runCommand("list_brands", {}, ctx) as Promise<Brand[]>,
    // A SKU is always a packaged format, so the filtered read names every row's format.
    runCommand("list_formats", { basis: "packaged" }, ctx) as Promise<Format[]>,
    canWrite ? runCommand("list_keg_pools", {}, ctx) as Promise<KegPoolOption[]> : Promise.resolve([]),
    // Only this brand's group's codes, under list_price_group_barcodes' own role
    // gate; a role without it sees only a SKU's own UPC.
    canRun(ctx, "list_price_group_barcodes") ? runCommand("list_price_group_barcodes", { brandId: id }, ctx) as Promise<PriceGroupBarcode[]> : Promise.resolve(undefined),
  ]);
  const brand = brands.find((b) => b.id === id) ?? notFound();
  return { canWrite, formats, pools, barcodes, brand };
});

export default async function SkuListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { canWrite, formats, pools, barcodes, brand } = await getSkuListPageData(id);
  const formatById = new Map(formats.map((f) => [f.id, f]));
  const skus = brand.skus.map((sku) => ({ ...sku, formats: formatById.get(sku.format_id) ?? null }));
  return (
    <SkuListView
      model={toSkuListViewProps({ brand, skus, pours: brand.pours, barcodes, backHref: `/catalog/brands/${id}#sells-as` })}
      createAction={null}
      rowAction={canWrite ? (row) => {
        if (row.kind === "poured") {
          const pour = brand.pours.find(p => `pour:${p.id}` === row.key)!;
          return brand.price_group_id
            ? <PourForm key={`${pour.id}-${pour.name}-${pour.ounces}`} priceGroupId={brand.price_group_id} groupName={brand.price_groups?.name} pour={pour} />
            : null;
        }
        const sku = skus.find((s) => s.id === row.key)!;
        return <SkuEditForm sku={sku} formatName={sku.formats?.name ?? "—"} packageType={sku.formats?.package_type} pools={pools} />;
      } : undefined}
    />
  );
}
