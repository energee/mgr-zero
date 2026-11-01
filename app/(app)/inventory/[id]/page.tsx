import { cache } from "react";
import { E } from "@/components/mgr/e";
import { InventoryDetailView } from "@/components/mgr/views/inventory-detail";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery, requirePagePermission } from "@/lib/mgr/page-query";
import { orNotFound } from "@/lib/mgr/not-found";
import { canReverseMovement, movementSourceHref, toInventoryDetailViewProps, type InventoryMovement } from "@/lib/mgr/inventory-detail-view";
import "@/lib/commands/all";
import { ReversalForm } from "../reversal-form";
import { navTitle } from "@/lib/mgr/nav";
import { historyPage, pageCursor, type HistoryPage } from "@/lib/mgr/history-page";

type Props = {
  params: Promise<{ id: string }>; searchParams: Promise<{ cursor?: string; movement?: string }>;
};

export async function generateMetadata({ params, searchParams }: Props) {
  const { id } = await params;
  const { cursor, movement } = await searchParams;
  await getInventoryDetailPageData(id, cursor, movement);
  return { title: navTitle("/inventory") };
}

const getInventoryDetailPageData = cache(async function getInventoryDetailPageData(id: string, rawCursor?: string, movement?: string) {
  const cursor = pageCursor(rawCursor);
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  requirePagePermission(ctx, "get_inventory_sku", "SKU detail");
  const sku = await orNotFound(runPageQuery("get_inventory_sku", { skuId: id }, ctx)) as { id: string; name: string; active: boolean };
  const [onHand, atp, movements] = await Promise.all([
    runPageQuery("get_on_hand", { skuId: id }, ctx), runPageQuery("get_atp", { skuId: id }, ctx),
    orNotFound(runPageQuery("list_movements", { skuId: id, movementId: movement, cursor }, ctx)),
  ]) as [{ location_id: string; qty: number; locations: { name: string } | null }[], { qty: number }[], HistoryPage<InventoryMovement>];
  return { brewery, cursor, sku, onHand, atp, movements };
});

export default async function InventoryDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { cursor: rawCursor, movement } = await searchParams;
  const { brewery, cursor, sku, onHand, atp, movements } = await getInventoryDetailPageData(id, rawCursor, movement);
  const href = `/inventory/${id}`;
  const page = historyPage(movements, href, cursor, { movement });
  const canMove = brewery.roles.includes("admin") || brewery.roles.includes("warehouse");
  return <InventoryDetailView model={toInventoryDetailViewProps({ sku, onHand, atp, movements: page.rows, backHref: "/inventory", timeZone: brewery.timeZone })}
    // Finished goods' Record movement, opened on this SKU (#1507).
    headerAction={canMove && sku.active ? E.btn("Record movement", "p", `/inventory?recordMovement=1&skuId=${id}`) : null}
    movementAction={m => m.compensates_id ? E.act("Original movement", "primary", `${href}?movement=${m.compensates_id}`)
      : m.reversed_by ? E.act("Reversal recorded", "primary", `${href}?movement=${m.id}`)
      : canReverseMovement(m) ? (brewery.roles.includes("admin") || brewery.roles.includes("warehouse") ? <ReversalForm movement={m} /> : "Read only")
      : m.type === "sale_removal" && m.ref ? E.act("Return shipment", "primary", `/orders/${m.ref}`)
      // Corrected where it was made: open the document it came from.
      : movementSourceHref(m) ? E.act(m.ref_label, "primary", movementSourceHref(m))
      : <span className="max-w-40 text-xs text-muted-foreground">{m.type === "depletion" ? "Count/depletion correction unavailable" : "Correct through the original workflow"}</span>}
    footer={<div className="flex gap-2">{movement && E.btn("All movements", "g", href)}{page.pagination.firstHref && E.btn("Newest movements", "g", page.pagination.firstHref)}{page.pagination.moreHref && E.btn("Older movements", "g", page.pagination.moreHref)}</div>} />;
}
