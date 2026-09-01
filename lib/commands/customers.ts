// lib/commands/customers.ts — customer / ship-to / price-list CRUD. Single-row
// writes call one explicit security-invoker RPC; pass `id` to update, omit to create.
import { z } from "zod";
import { defineCommand, defineQuery, unwrap } from "./registry";

const roles = ["admin", "sales"] as const;

defineCommand({
  name: "upsert_customer", description: "Create or update a customer account",
  roles: [...roles],
  input: z.object({
    id: z.string().uuid().optional(), name: z.string().min(1),
    type: z.enum(["distributor", "retailer", "brewery", "other"]),
    state: z.string().regex(/^[A-Z]{2}$/), // customers.state is NOT NULL (home state)
    priceListId: z.string().uuid().optional(), licenseNumber: z.string().optional(),
    paymentTerms: z.string().optional(),
  }),
  handler: (ctx, i) => unwrap(ctx.db.rpc("upsert_customer", {
    p_id: i.id ?? null, p_brewery: ctx.breweryId, p_name: i.name, p_type: i.type, p_state: i.state,
    p_price_list: i.priceListId ?? null, p_license_no: i.licenseNumber ?? null,
    p_payment_terms: i.paymentTerms || null,
  })),
});

defineCommand({
  name: "upsert_ship_to", description: "Create or update a ship-to address (state drives excise dest_state)",
  roles: [...roles],
  input: z.object({
    id: z.string().uuid().optional(), customerId: z.string().uuid(), label: z.string().min(1),
    address1: z.string().min(1), address2: z.string().optional(),
    city: z.string().min(1), state: z.string().regex(/^[A-Z]{2}$/), zip: z.string().min(1),
  }),
  handler: (ctx, i) => unwrap(ctx.db.rpc("upsert_ship_to", {
    p_id: i.id ?? null, p_brewery: ctx.breweryId, p_customer: i.customerId,
    p_label: i.label, p_address1: i.address1, p_address2: i.address2 ?? null,
    p_city: i.city, p_state: i.state, p_zip: i.zip,
  })),
});

defineCommand({
  name: "upsert_price_list", description: "Create or rename a price list",
  roles: [...roles],
  input: z.object({ id: z.string().uuid().optional(), name: z.string().min(1) }),
  handler: (ctx, i) => unwrap(ctx.db.rpc("upsert_price_list", {
    p_id: i.id ?? null, p_brewery: ctx.breweryId, p_name: i.name,
  })),
});

defineCommand({
  name: "set_price", description: "Set a SKU's price on a price list (integer cents)",
  roles: [...roles],
  input: z.object({ priceListId: z.string().uuid(), skuId: z.string().uuid(), unitPriceCents: z.number().int().nonnegative() }),
  handler: (ctx, i) => unwrap(ctx.db.rpc("set_price", {
    p_brewery: ctx.breweryId, p_price_list: i.priceListId, p_sku: i.skuId,
    p_unit_price_cents: i.unitPriceCents,
  })),
});

defineCommand({
  name: "set_portal_fulfillment_source", description: "Set the warehouse used for customer portal orders",
  roles: ["admin"],
  input: z.object({ locationId: z.string().uuid() }),
  handler: (ctx, i) => unwrap(ctx.db.rpc("set_portal_fulfillment_source", {
    p_brewery: ctx.breweryId, p_location: i.locationId,
  })),
});

defineQuery({
  name: "list_customers", description: "Customers alphabetical with price list name",
  roles: ["admin", "sales", "warehouse"],
  input: z.object({}),
  handler: (ctx) => unwrap(ctx.db.from("customers").select("*, price_lists(name)").eq("brewery_id", ctx.breweryId).order("name")),
});

defineQuery({
  name: "get_customer", description: "One customer with ship-tos",
  roles: ["admin", "sales", "warehouse"],
  input: z.object({ customerId: z.string().uuid() }),
  handler: async (ctx, i) => {
    const customer = await unwrap(ctx.db.from("customers").select("*, price_lists(name)").eq("id", i.customerId).single());
    const shipTos = await unwrap(ctx.db.from("ship_tos").select().eq("customer_id", i.customerId).order("label"));
    return { customer, shipTos };
  },
});

defineQuery({
  name: "list_price_lists", description: "Price lists with their per-SKU prices",
  roles: ["admin", "sales"],
  input: z.object({}),
  handler: (ctx) => unwrap(ctx.db.from("price_lists").select("*, price_list_items(sku_id, unit_price_cents, skus(name))").eq("brewery_id", ctx.breweryId).order("name")),
});
