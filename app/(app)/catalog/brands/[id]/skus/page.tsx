// app/(app)/catalog/brands/[id]/skus/page.tsx — SKU list (screen record): every
// package sold under one brand. Catalog links here from the brand row instead of
// nesting the packages inline. list_brands already nests each brand's SKUs, so
// the only other read is the packaged formats, which name them and back New SKU.
// New SKU and Edit SKU are the sku-form.tsx sheets, Admin and Sales only.
import { notFound } from "next/navigation";
import { SkuListView } from "@/components/mgr/views/sku-list";
import { toSkuListViewProps } from "@/lib/mgr/sku-list-view";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { SkuForm, SkuEditForm, type FormatOption } from "../../../sku-form";

type Sku = { id: string; name: string; format_id: string; active: boolean; upc: string | null };
type Brand = { id: string; name: string; skus: Sku[] };
type Format = { id: string; name: string; bbl_per_unit: string | null };

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
      model={toSkuListViewProps({ brand, skus, backHref: `/catalog/brands/${id}` })}
      createAction={canWrite ? <SkuForm brandId={id} formats={options} /> : null}
      rowAction={canWrite ? (row) => {
        const sku = skus.find((s) => s.id === row.key)!;
        return <SkuEditForm sku={sku} formatName={sku.formats?.name ?? "—"} />;
      } : undefined}
    />
  );
}
