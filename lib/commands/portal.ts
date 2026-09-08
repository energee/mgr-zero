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
    // RLS limits channel prices to the caller's own sale channel and skus to
    // active ones; sku_prices already resolves the grid lookup (the cell where
    // the caller's sale channel meets the brand's price group and the SKU's
    // format), so a SKU with no group or an empty cell simply has no row.
    const [prices, avail] = await Promise.all([
      unwrap(ctx.db.from("sku_prices").select("sku_id, sku_name, brand_name, unit_price_cents")),
      unwrap(ctx.db.rpc("portal_availability", { p_customer: customerId })),
    ]);
    const badges = new Map((avail as { sku_id: string; badge: string }[]).map(a => [a.sku_id, a.badge]));
    const priceRows = prices as { sku_id: string; sku_name: string; brand_name: string; unit_price_cents: number }[];
    return priceRows.map(p => ({
      skuId: p.sku_id, name: p.sku_name, product: p.brand_name,
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
  name: "portal_order", description: "Portal: one order with lines, its event history and its shipment once shipped",
  roles: "customer",
  input: z.object({ orderId: z.string().uuid() }),
  handler: async (ctx, i) => {
    requireCustomer(ctx);
    const order = await unwrap(ctx.db.from("orders").select("*, ship_tos(label, city, state)").eq("id", i.orderId).single());
    const [ln, events, shipment] = await Promise.all([
      unwrap(ctx.db.from("order_lines").select("*, skus(name)").eq("order_id", i.orderId)),
      unwrap(ctx.db.from("order_events").select().eq("order_id", i.orderId).order("created_at")),
      unwrap(ctx.db.from("shipments").select("id").eq("order_id", i.orderId).maybeSingle()),
    ]);
    return { order, lines: ln, events, shipment };
  },
});

defineQuery({
  name: "portal_invoices", description: "Portal: the caller's invoices and credit memos",
  roles: "customer",
  input: z.object({}),
  handler: (ctx) => unwrap(ctx.db.from("invoices").select("*, invoice_lines(*, skus(name))").eq("customer_id", requireCustomer(ctx)).order("created_at", { ascending: false })),
});

defineQuery({
  name: "get_portal_account", description: "Portal: the caller's customer, ship-tos, this login's membership, and keg deposits held; peer portal users are never listed",
  roles: "customer",
  input: z.object({}),
  handler: async (ctx) => {
    const customerId = requireCustomer(ctx);
    const [customer, shipTos, deposits] = await Promise.all([
      unwrap(ctx.db.from("customers").select("id, name").eq("id", customerId).single()),
      unwrap(ctx.db.from("ship_tos").select("id, label, address1, city, state, zip").eq("customer_id", customerId).order("label")),
      unwrap(ctx.db.from("keg_deposit_balances").select("keg_size, kegs_on_deposit, deposit_cents").eq("customer_id", customerId)),
    ]);
    return {
      customer, shipTos, membership: { userId: ctx.userId },
      deposits: (deposits as { keg_size: string | null; kegs_on_deposit: number; deposit_cents: number }[])
        .filter((d) => d.kegs_on_deposit !== 0)
        .map((d) => ({ kegSize: d.keg_size, kegsOnDeposit: d.kegs_on_deposit, depositCents: d.deposit_cents })),
    };
  },
});

defineQuery({
  name: "portal_invoice", description: "Portal: one of the caller's invoices or credit memos with its lines and total; another customer's id is not found",
  roles: "customer",
  input: z.object({ invoiceId: z.string().uuid() }),
  handler: async (ctx, i) => {
    const customerId = requireCustomer(ctx);
    // RLS already scopes to the caller's customer; the customer_id filter makes a foreign id a plain not_found
    const [invoice, lines] = await Promise.all([
      unwrap(ctx.db.from("invoices").select("id, invoice_no, kind, issued_on, due_on, paid_at").eq("id", i.invoiceId).eq("customer_id", customerId).single()),
      unwrap(ctx.db.from("invoice_lines").select("id, kind, qty, unit_price_cents, amount_cents, description, skus(name)").eq("invoice_id", i.invoiceId)),
    ]);
    const total_cents = (lines as { amount_cents: number }[]).reduce((n, l) => n + l.amount_cents, 0);
    return { invoice: { ...invoice, total_cents }, lines };
  },
});
