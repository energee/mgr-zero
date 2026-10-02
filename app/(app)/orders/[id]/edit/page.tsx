// Authorized saved-draft route: non-drafts return to detail before edit options load.
import { redirect } from "next/navigation";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery, requirePagePermission } from "@/lib/mgr/page-query";
import { orNotFound } from "@/lib/mgr/not-found";
import { toSkuOption } from "@/lib/order-form-rules";
import { docNo } from "@/lib/mgr/doc-no";
import { EditDraftForm } from "../edit-draft-form";
import "@/lib/commands/all";

type Draft = { id: string; order_no: number | null; status: string; kind: "wholesale" | "taproom_transfer"; customer_id: string | null; sale_channel_id: string | null; ship_to_id: string | null; requested_ship_date: string | null; po_number: string | null; customers: { name: string } | null };
type Line = { sku_id: string; qty_ordered: number; skus: { name: string } | null };
type Sku = { id: string; name: string; brands: { name: string } | null };

export default async function EditDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  requirePagePermission(ctx, "update_draft_order", "Edit draft");
  const { order, lines } = await orNotFound(runPageQuery("get_order", { orderId: id }, ctx)) as { order: Draft; lines: Line[] };
  if (order.status !== "draft") redirect(`/orders/${order.id}`);
  const customer = order.customer_id ? await runPageQuery("get_customer", { customerId: order.customer_id }, ctx) as { customer: { sale_channel_id: string }; shipTos: { id: string; label: string }[] } : null;
  const skuRows = await runPageQuery("list_skus", { active: true, ...(order.kind === "wholesale" && order.sale_channel_id ? { saleChannelId: order.sale_channel_id } : {}) }, ctx) as Sku[];
  const skus = skuRows.map(toSkuOption);
  return <EditDraftForm orderId={order.id} model={{ title: docNo("ORD", order.order_no, "Order"), kind: order.kind,
    customer: order.customers?.name ?? "Taproom transfer", shipToId: order.ship_to_id ?? "", shipTos: customer?.shipTos ?? [],
    requestedShipDate: order.requested_ship_date ?? "", poNumber: order.po_number ?? "", skus,
    lines: lines.map(line => ({ skuId: line.sku_id, qty: String(line.qty_ordered) })), backHref: `/orders/${order.id}` }} />;
}
