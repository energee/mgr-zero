// lib/commands/customers.ts — customer / ship-to / price-list CRUD. Single-row
// writes; RLS scopes tenancy. Upsert style: pass `id` to update, omit to create.
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
  handler: (ctx, i) => unwrap(ctx.db.from("customers").upsert({
    ...(i.id ? { id: i.id } : {}), brewery_id: ctx.breweryId, name: i.name, type: i.type,
    state: i.state, price_list_id: i.priceListId ?? null, license_no: i.licenseNumber ?? null,
    ...(i.paymentTerms ? { payment_terms: i.paymentTerms } : {}),
  }).select().single()),
});

defineCommand({
  name: "upsert_ship_to", description: "Create or update a ship-to address (state drives excise dest_state)",
  roles: [...roles],
  input: z.object({
    id: z.string().uuid().optional(), customerId: z.string().uuid(), label: z.string().min(1),
    address1: z.string().min(1), address2: z.string().optional(),
    city: z.string().min(1), state: z.string().regex(/^[A-Z]{2}$/), zip: z.string().min(1),
  }),
  handler: (ctx, i) => unwrap(ctx.db.from("ship_tos").upsert({
    ...(i.id ? { id: i.id } : {}), brewery_id: ctx.breweryId, customer_id: i.customerId,
    label: i.label, address1: i.address1, address2: i.address2 ?? null,
    city: i.city, state: i.state, zip: i.zip,
  }).select().single()),
});

defineCommand({
  name: "upsert_price_list", description: "Create or rename a price list",
  roles: [...roles],
  input: z.object({ id: z.string().uuid().optional(), name: z.string().min(1) }),
  handler: (ctx, i) => unwrap(ctx.db.from("price_lists").upsert({
    ...(i.id ? { id: i.id } : {}), brewery_id: ctx.breweryId, name: i.name,
  }).select().single()),
});

defineCommand({
  name: "set_price", description: "Set a SKU's price on a price list (integer cents)",
  roles: [...roles],
  input: z.object({ priceListId: z.string().uuid(), skuId: z.string().uuid(), unitPriceCents: z.number().int().nonnegative() }),
  handler: (ctx, i) => unwrap(ctx.db.from("price_list_items").upsert({
    brewery_id: ctx.breweryId, price_list_id: i.priceListId, sku_id: i.skuId, unit_price_cents: i.unitPriceCents,
  }).select().single()),
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
