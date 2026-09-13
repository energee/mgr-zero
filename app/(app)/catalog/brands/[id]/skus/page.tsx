// app/(app)/catalog/brands/[id]/skus/page.tsx — SKU list (screen record): every
// package sold under one brand. Catalog links here from the brand row instead of
// nesting the packages inline. Reads list_brands, list_skus and list_formats;
// New SKU and Edit SKU are the sku-form.tsx sheets, Admin and Sales only.
import { notFound } from "next/navigation";
import { SkuListView } from "@/components/mgr/views/sku-list";
import { toSkuListViewProps, type SkuListSnapshot } from "@/lib/mgr/sku-list-view";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { SkuForm, SkuEditForm, type FormatOption } from "../../../sku-form";

type Sku = SkuListSnapshot["skus"][number] & { brand_id: string; upc?: string | null };
type Format = { id: string; name: string; basis: "packaged" | "poured" };

export default async function SkuListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const canWrite = brewery.role === "admin" || brewery.role === "sales";
  const [brands, skus, formats] = await Promise.all([
    runCommand("list_brands", {}, ctx) as Promise<{ id: string; name: string }[]>,
    runCommand("list_skus", {}, ctx) as Promise<Sku[]>,
    runCommand("list_formats", {}, ctx) as Promise<Format[]>,
  ]);
  const brand = brands.find((b) => b.id === id);
  if (!brand) notFound();
  const mine = skus.filter((sku) => sku.brand_id === id);
  const packaged: FormatOption[] = formats.filter((f) => f.basis === "packaged").map((f) => ({ id: f.id, name: f.name }));
  // The view keys each row by SKU id, so Edit SKU reads its mutable facts back here.
  const edit = (id: string) => {
    const sku = mine.find((s) => s.id === id)!;
    return { id: sku.id, name: sku.name, active: sku.active, upc: sku.upc ?? null, formatName: sku.formats?.name ?? "—" };
  };
  return (
    <SkuListView
      model={toSkuListViewProps({ brand, skus: mine, backHref: `/catalog/brands/${id}` })}
      createAction={canWrite ? <SkuForm brandId={id} formats={packaged} /> : null}
      rowAction={canWrite ? (row) => <SkuEditForm sku={edit(row.key)} formatName={edit(row.key).formatName} /> : undefined}
    />
  );
}
