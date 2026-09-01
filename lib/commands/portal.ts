// lib/commands/portal.ts — customer-portal commands. role: "customer" only;
// ctx.customerId scopes everything. Mutations call request-ledger-backed RPCs
// that derive the caller's tenant and role inside the database.
import { z } from "zod";
import { defineCommand, defineQuery, unwrap, CommandError, Ctx } from "./registry";

const lines = z.array(z.object({ skuId: z.string().uuid(), qty: z.number().positive() })).min(1);

function requireCustomer(ctx: Ctx): string {
  if (!ctx.customerId) throw new CommandError("not a portal customer");
  return ctx.customerId;
}

defineCommand({
  name: "portal_create_order", description: "Portal: create a draft order for the caller's account",
  roles: "customer",
  input: z.object({ shipToId: z.string().uuid(), poNumber: z.string().optional(), note: z.string().optional(), lines }),
  handler: (ctx, i, execution) => {
    const customerId = requireCustomer(ctx);
    return unwrap(ctx.db.rpc("portal_create_order", {
      p_brewery: ctx.breweryId,
      p_customer: customerId,
      p_ship_to: i.shipToId,
      p_po: i.poNumber ?? null,
      p_note: i.note ?? null,
      p_lines: i.lines.map(l => ({ sku_id: l.skuId, qty: l.qty })),
      p_request_id: execution.requestId,
    }));
  },
});

defineCommand({
  name: "portal_update_draft_order", description: "Portal: replace a draft order's lines/fields",
  roles: "customer",
  input: z.object({ orderId: z.string().uuid(), shipToId: z.string().uuid().optional(), poNumber: z.string().optional(), note: z.string().optional(), lines }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("update_draft_order", {
    p_order: i.orderId, p_ship_to: i.shipToId ?? null, p_requested: null,
    p_po: i.poNumber ?? null, p_note: i.note ?? null,
    p_lines: i.lines.map(l => ({ sku_id: l.skuId, qty: l.qty })), p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "portal_submit_order", description: "Portal: submit a draft order",
  roles: "customer",
  input: z.object({ orderId: z.string().uuid() }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("submit_order", { p_order: i.orderId, p_request_id: execution.requestId })),
});

defineQuery({
  name: "portal_catalog", description: "Portal: orderable SKUs with the caller's prices and an availability badge",
  roles: "customer",
  input: z.object({}),
  handler: async (ctx) => {
    const customerId = requireCustomer(ctx);
    // RLS limits price_list_items to the caller's list and skus to active.
    const [prices, avail] = await Promise.all([
      unwrap(ctx.db.from("price_list_items").select("sku_id, unit_price_cents, skus(id, name, products(name))")),
      unwrap(ctx.db.rpc("portal_availability", { p_customer: customerId })),
    ]);
    const badges = new Map((avail as { sku_id: string; badge: string }[]).map(a => [a.sku_id, a.badge]));
    // postgrest-js infers embedded resources as arrays without generated DB
    // types; both sku_id->skus and product_id->products are many-to-one, so
    // the real JSON shape at runtime is a single nested object per row.
    const priceRows = prices as unknown as { sku_id: string; unit_price_cents: number; skus: { name: string; products: { name: string } } }[];
    return priceRows.map(p => ({
      skuId: p.sku_id, name: p.skus.name, product: p.skus.products.name,
      unitPriceCents: p.unit_price_cents, badge: badges.get(p.sku_id) ?? "out",
    }));
  },
});

defineQuery({
  name: "portal_orders", description: "Portal: the caller's orders, newest first",
  roles: "customer",
  input: z.object({}),
  handler: (ctx) => unwrap(ctx.db.from("orders").select("*, order_lines(*, skus(name))").eq("customer_id", requireCustomer(ctx)).order("created_at", { ascending: false })),
});

defineQuery({
  name: "portal_order", description: "Portal: one order with lines and its event history",
  roles: "customer",
  input: z.object({ orderId: z.string().uuid() }),
  handler: async (ctx, i) => {
    requireCustomer(ctx);
    const order = await unwrap(ctx.db.from("orders").select("*, ship_tos(label, city, state)").eq("id", i.orderId).single());
    const [ln, events] = await Promise.all([
      unwrap(ctx.db.from("order_lines").select("*, skus(name)").eq("order_id", i.orderId)),
      unwrap(ctx.db.from("order_events").select().eq("order_id", i.orderId).order("created_at")),
    ]);
    return { order, lines: ln, events };
  },
});

defineQuery({
  name: "portal_invoices", description: "Portal: the caller's invoices and credit memos",
  roles: "customer",
  input: z.object({}),
  handler: (ctx) => unwrap(ctx.db.from("invoices").select("*, invoice_lines(*, skus(name))").eq("customer_id", requireCustomer(ctx)).order("created_at", { ascending: false })),
});
