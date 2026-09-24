import { formatDateTime } from "@/lib/date-format";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { money } from "@/lib/mgr/money";
import { canOpen } from "@/lib/mgr/nav";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import type { PosSaleRow, PosVariationRow } from "@/lib/mgr/pos-view";
import "@/lib/commands/all";
import { PosMappingControl } from "@/components/mgr/views/pos-controls";

type Variation = { externalItemId: string; externalVariationId: string; itemName: string | null; variationName: string | null; available: boolean; mappingLabel: string | null; disposition: PosVariationRow["disposition"] };
type Sku = { id: string; name: string; active: boolean };
type Format = { id: string; name: string; brands: { name: string } | null };
type Sale = { id: string; factKind: "sale" | "return"; itemName: string; variationName: string; locationName: string; soldAt: string; current: boolean; sourceVersion: string; grossCents: number | null; mappingStatus: PosSaleRow["status"] };
type Coverage = { complete: boolean; external_location_id: string; starts_at: string; ends_at: string };
type Facts = { sales: Sale[]; coverage: Coverage[] };

export default async function PosMappingPage() {
  const brewery = await getActiveBrewery(), ctx = await buildContext(brewery.id);
  const [rawVariations, skus, formats, facts] = await Promise.all([
    runCommand("list_pos_variations", {}, ctx) as Promise<Variation[]>,
    runCommand("list_skus", {}, ctx) as Promise<Sku[]>,
    runCommand("list_formats", { basis: "poured" }, ctx) as Promise<Format[]>,
    runCommand("list_pos_sales", {}, ctx) as Promise<Facts>,
  ]);
  const variations: PosVariationRow[] = rawVariations.map(row => ({
    externalItemId: row.externalItemId, externalVariationId: row.externalVariationId,
    label: [row.itemName, row.variationName].filter(Boolean).join(" · ") || row.externalVariationId,
    detail: `${row.available ? "available" : "not available"}${row.mappingLabel ? ` · ${row.mappingLabel}` : " · choose a mapping or ignore"}`,
    disposition: row.disposition,
  }));
  const sales: PosSaleRow[] = facts.sales.map(row => ({
    id: row.id, label: `${row.factKind === "return" ? "Return" : "Sale"} · ${row.itemName} · ${row.variationName}`,
    detail: `${row.locationName} · ${formatDateTime(row.soldAt)} · ${row.current ? "current revision" : `revision ${row.sourceVersion}`}`,
    amount: row.grossCents == null ? "No amount" : money(row.grossCents), status: row.mappingStatus,
    href: `/settings/pos/sales/${row.id}`,
  }));
  const coverage = facts.coverage.filter(row => row.complete).map(row =>
    `${row.external_location_id} · ${formatDateTime(row.starts_at)} to ${formatDateTime(row.ends_at)}`,
  );
  // Point of sale is admin-only; warehouse reached POS mapping from More (#444).
  const back = canOpen(brewery.role, "/settings/pos") ? { href: "/settings/pos", label: "Point of sale" } : { href: "/more", label: "More" };
  return <PosMappingControl variations={variations} sales={sales} coverage={coverage} canSync={brewery.role === "admin"} back={back} targets={[
    ...skus.filter(row => row.active).map(row => ({ value: `sku:${row.id}`, label: `SKU · ${row.name}` })),
    ...formats.map(row => ({ value: `format:${row.id}`, label: `Pour · ${row.brands?.name ?? "Brand"} · ${row.name}` })),
  ]} />;
}
