// One brand’s sellable SKUs: stocked packages and non-stock pours. Each row
// names its barcode, its own UPC or its price group’s (list_price_group_barcodes).
// Existing serving identities remain the boundary for poured POS activity.
import type { KegPoolOption } from "@/lib/mgr/sku-view";
import type { PriceGroupBarcode } from "@/lib/mgr/price-groups-view";
import { notFound } from "next/navigation";
import { SkuListView } from "@/components/mgr/views/sku-list";
import { toSkuListViewProps } from "@/lib/mgr/sku-list-view";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { PourForm } from "../../../pour-form";
import { SkuForm, SkuEditForm, type FormatOption } from "../../../sku-form";

type Sku = { id: string; name: string; format_id: string; active: boolean; upc: string | null; keg_pool_id: string | null };
type Brand = { id: string; name: string; price_group_id: string | null; price_groups: { name: string } | null; skus: Sku[]; pours: { id: string; name: string; ounces: number }[] };
type Format = { package_type: string | null; id: string; name: string; bbl_per_unit: string | null; effective_bbl_per_unit: string | number | null };

export default async function SkuListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const canWrite = brewery.role === "admin" || brewery.role === "sales";
  const [brands, formats, pools, barcodes] = await Promise.all([
    runCommand("list_brands", {}, ctx) as Promise<Brand[]>,
    // A SKU is always a packaged format, so one filtered read serves both the
    // rows' format names and the New SKU picker.
    runCommand("list_formats", { basis: "packaged" }, ctx) as Promise<Format[]>,
    canWrite ? runCommand("list_keg_pools", {}, ctx) as Promise<KegPoolOption[]> : Promise.resolve([]),
    // Group codes are an admin/sales read (list_price_group_barcodes); other roles see only a SKU's own UPC.
    canWrite ? runCommand("list_price_group_barcodes", {}, ctx) as Promise<PriceGroupBarcode[]> : Promise.resolve([]),
  ]);
  const brand = brands.find((b) => b.id === id) ?? notFound();
  const formatById = new Map(formats.map((f) => [f.id, f]));
  const skus = brand.skus.map((sku) => ({ ...sku, formats: formatById.get(sku.format_id) ?? null }));
  const options: FormatOption[] = formats.map((f) => ({ id: f.id, name: f.name, package_type: f.package_type }));
  return (
    <SkuListView
      model={toSkuListViewProps({ brand, skus, pours: brand.pours, barcodes: barcodes.filter((b) => b.price_group_id === brand.price_group_id), backHref: `/catalog/brands/${id}` })}
      createAction={canWrite ? <SkuForm brandId={id} formats={options} pools={pools} /> : null}
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
