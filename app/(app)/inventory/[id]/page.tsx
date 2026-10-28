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

type Props = {
  params: Promise<{ id: string }>; searchParams: Promise<{ page?: string; movement?: string }>;
};

export async function generateMetadata({ params, searchParams }: Props) {
  const { id } = await params;
  const { page: rawPage, movement } = await searchParams;
  await getInventoryDetailPageData(id, rawPage, movement);
  return { title: navTitle("/inventory") };
}

const getInventoryDetailPageData = cache(async function getInventoryDetailPageData(id: string, rawPage?: string, movement?: string) {
  const page = /^\d{1,6}$/.test(rawPage ?? "") ? Math.max(0, Number(rawPage) - 1) : 0;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  requirePagePermission(ctx, "get_inventory_sku", "SKU detail");
  const sku = await orNotFound(runPageQuery("get_inventory_sku", { skuId: id }, ctx)) as { id: string; name: string; active: boolean };
  const [onHand, atp, movements] = await Promise.all([
    runPageQuery("get_on_hand", { skuId: id }, ctx), runPageQuery("get_atp", { skuId: id }, ctx),
    orNotFound(runPageQuery("list_movements", { skuId: id, movementId: movement, limit: 51, offset: page * 50 }, ctx)),
  ]) as [{ location_id: string; qty: number; locations: { name: string } | null }[], { qty: number }[], InventoryMovement[]];
  return { brewery, page, sku, onHand, atp, movements };
});

export default async function InventoryDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { page: rawPage, movement } = await searchParams;
  const { brewery, page, sku, onHand, atp, movements } = await getInventoryDetailPageData(id, rawPage, movement);
  const href = `/inventory/${id}`;
  return <InventoryDetailView model={toInventoryDetailViewProps({ sku, onHand, atp, movements: movements.slice(0, 50), backHref: "/inventory", timeZone: brewery.timeZone })}
    movementAction={m => m.compensates_id ? E.act("Original movement", "primary", `${href}?movement=${m.compensates_id}`)
      : m.reversed_by ? E.act("Reversal recorded", "primary", `${href}?movement=${m.id}`)
      : canReverseMovement(m) ? (brewery.roles.includes("admin") || brewery.roles.includes("warehouse") ? <ReversalForm movement={m} /> : "Read only")
      : m.type === "sale_removal" && m.ref ? E.act("Return shipment", "primary", `/orders/${m.ref}`)
      // Corrected where it was made: open the document it came from.
      : movementSourceHref(m) ? E.act(m.ref_label, "primary", movementSourceHref(m))
      : <span className="max-w-40 text-xs text-muted-foreground">{m.type === "depletion" ? "Count/depletion correction unavailable" : "Correct through the original workflow"}</span>}
    footer={<div className="flex gap-2">{movement && E.btn("All movements", "g", href)}{page > 0 && E.btn("Newer movements", "g", `${href}?page=${page}`)}{movements.length > 50 && E.btn("Older movements", "g", `${href}?page=${page + 2}`)}</div>} />;
}
