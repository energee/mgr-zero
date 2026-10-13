// lib/commands/material-trace.ts — recipient reads shared by finished and material lot recall.
import type { Ctx } from "./registry";
import { completeRows, inChunks, PAGE_SIZE } from "./registry";

/** Page parent and child collections separately: embedded invoice arrays can truncate independently. */
export async function recipientsFor(ctx: Ctx, orderIds: string[]) {
  const orders = await inChunks([...new Set(orderIds)], async chunk => completeRows("Recall recipients", start => ctx.db.from("orders")
    .select("id,order_no,customers(id,name),ship_tos(id,label,address1,address2,city,state,zip)", { count: "exact" })
    .eq("brewery_id", ctx.breweryId).in("id", chunk).order("id").range(start, start + PAGE_SIZE - 1)));
  const shipments = await inChunks(orders.map(order => order.id), async chunk => completeRows("Recall shipments", start => ctx.db.from("shipments")
    .select("id,order_id,carrier,tracking", { count: "exact" }).eq("brewery_id", ctx.breweryId)
    .in("order_id", chunk).order("id").range(start, start + PAGE_SIZE - 1)));
  const invoices = await inChunks(shipments.map(shipment => shipment.id), async chunk => completeRows("Recall invoices", start => ctx.db.from("invoices")
    .select("id,invoice_no,shipment_id", { count: "exact" }).eq("brewery_id", ctx.breweryId)
    .in("shipment_id", chunk).order("id").range(start, start + PAGE_SIZE - 1)));
  return orders.map(order => ({
    ...order,
    shipments: shipments.filter(shipment => shipment.order_id === order.id).map(shipment => ({
      id: shipment.id, carrier: shipment.carrier, tracking: shipment.tracking,
      invoices: invoices.filter(invoice => invoice.shipment_id === shipment.id).map(invoice => ({ id: invoice.id, invoice_no: invoice.invoice_no })),
    })),
  }));
}
