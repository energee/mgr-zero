// lib/commands/recall-recipients.ts — recall recipients shared by finished and material lot traces.
import type { Ctx } from "./registry";
import { completeRows, inChunks, PAGE_SIZE } from "./registry";

type Shipment = { id: string; order_id: string; carrier: string | null; tracking: string | null };
type Invoice = { id: string; invoice_no: number; shipment_id: string };

/** Page parent and child collections separately: embedded invoice arrays can truncate independently. */
export async function recipientsFor(ctx: Ctx, orderIds: string[]) {
  const ids = [...new Set(orderIds)];
  // Shipments filter on the same order ids, so both reads start together.
  const [orders, shipments] = await Promise.all([
    inChunks(ids, async chunk => completeRows("Recall recipients", start => ctx.db.from("orders")
      .select("id,order_no,customers(id,name),ship_tos(id,label,address1,address2,city,state,zip)", { count: "exact" })
      .eq("brewery_id", ctx.breweryId).in("id", chunk).order("id").range(start, start + PAGE_SIZE - 1))),
    inChunks(ids, async chunk => completeRows("Recall shipments", start => ctx.db.from("shipments")
      .select("id,order_id,carrier,tracking", { count: "exact" }).eq("brewery_id", ctx.breweryId)
      .in("order_id", chunk).order("id").range(start, start + PAGE_SIZE - 1))) as Promise<Shipment[]>,
  ]);
  const invoices = await inChunks(shipments.map(shipment => shipment.id), async chunk => completeRows("Recall invoices", start => ctx.db.from("invoices")
    .select("id,invoice_no,shipment_id", { count: "exact" }).eq("brewery_id", ctx.breweryId)
    .in("shipment_id", chunk).order("id").range(start, start + PAGE_SIZE - 1))) as Invoice[];
  const shipmentsByOrder = Map.groupBy(shipments, shipment => shipment.order_id);
  const invoicesByShipment = Map.groupBy(invoices, invoice => invoice.shipment_id);
  return orders.map(order => ({
    ...order,
    shipments: (shipmentsByOrder.get(order.id) ?? []).map(shipment => ({
      id: shipment.id, carrier: shipment.carrier, tracking: shipment.tracking,
      invoices: (invoicesByShipment.get(shipment.id) ?? []).map(invoice => ({ id: invoice.id, invoice_no: invoice.invoice_no })),
    })),
  }));
}
