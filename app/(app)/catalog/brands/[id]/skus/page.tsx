// One brand’s sellable SKUs: stocked packages and non-stock pours.
// Existing serving identities remain the boundary for poured POS activity.
import { notFound } from "next/navigation";
import { SkuListView } from "@/components/mgr/views/sku-list";
import { toSkuListViewProps } from "@/lib/mgr/sku-list-view";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { PourForm } from "../../../pour-form";
import { SkuForm, SkuEditForm, type FormatOption } from "../../../sku-form";

type Sku = { id: string; name: string; format_id: string; active: boolean; upc: string | null };
type Brand = { id: string; name: string; skus: Sku[]; pours: { id: string; name: string; ounces: number }[] };
type Format = { id: string; name: string; bbl_per_unit: string | null; effective_bbl_per_unit: string | number | null };

export default async function SkuListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const canWrite = brewery.role === "admin" || brewery.role === "sales";
  const [brands, formats] = await Promise.all([
    runCommand("list_brands", {}, ctx) as Promise<Brand[]>,
    // A SKU is always a packaged format, so one filtered read serves both the
    // rows' format names and the New SKU picker.
    runCommand("list_formats", { basis: "packaged" }, ctx) as Promise<Format[]>,
  ]);
  const brand = brands.find((b) => b.id === id) ?? notFound();
  const formatById = new Map(formats.map((f) => [f.id, f]));
  const skus = brand.skus.map((sku) => ({ ...sku, formats: formatById.get(sku.format_id) ?? null }));
  const options: FormatOption[] = formats.map((f) => ({ id: f.id, name: f.name }));
  return (
    <SkuListView
      model={toSkuListViewProps({ brand, skus, pours: brand.pours, backHref: `/catalog/brands/${id}` })}
      createAction={canWrite ? <SkuForm brandId={id} formats={options} /> : null}
      rowAction={canWrite ? (row) => {
        if (row.kind === "poured") {
          const pour = brand.pours.find(p => `pour:${p.id}` === row.key)!;
          return <PourForm key={`${pour.id}-${pour.name}-${pour.ounces}`} brand={brand} pour={pour} />;
        }
        const sku = skus.find((s) => s.id === row.key)!;
        return <SkuEditForm sku={sku} formatName={sku.formats?.name ?? "—"} />;
      } : undefined}
    />
  );
}
