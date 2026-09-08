// lib/commands/customers.ts — customer / ship-to CRUD and the price grid's
// cells (channel × price group × format). Single-row writes call one explicit
// security-definer RPC; pass `id` to update, omit to create.
import { z } from "zod";
import { defineCommand, defineQuery, stateCode, unwrap } from "./registry";

const roles = ["admin", "sales"] as const;

defineCommand({
  name: "upsert_customer", description: "Create or update a customer account: its sale channel decides its prices and where its removals post; tax treatment may override the channel default",
  roles: [...roles],
  input: z.object({
    id: z.string().uuid().optional(), name: z.string().min(1),
    type: z.enum(["distributor", "retailer", "brewery", "other"]),
    state: stateCode, // customers.state is NOT NULL (home state)
    // The channel is the customer's row into the price grid (§16.3) and is required.
    saleChannelId: z.string().uuid(),
    licenseNumber: z.string().optional(), paymentTerms: z.string().optional(),
    // Overrides the sale channel's tax treatment for this customer's removals
    // (§16.3); omit it to inherit the channel default.
    taxTreatment: z.enum(["taxable", "export", "vessel_supplies", "research", "transfer_in_bond"]).optional(),
  }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("upsert_customer", {
    p_brewery: ctx.breweryId, p_id: i.id ?? null, p_name: i.name, p_type: i.type, p_state: i.state,
    p_sale_channel: i.saleChannelId, p_license_no: i.licenseNumber ?? null,
    p_payment_terms: i.paymentTerms || null, p_tax_treatment: i.taxTreatment ?? null, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "upsert_ship_to", description: "Create or update a ship-to address (state drives excise dest_state)",
  roles: [...roles],
  input: z.object({
    id: z.string().uuid().optional(), customerId: z.string().uuid(), label: z.string().min(1),
    address1: z.string().min(1), address2: z.string().optional(),
    city: z.string().min(1), state: stateCode, zip: z.string().min(1),
  }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("upsert_ship_to", {
    p_brewery: ctx.breweryId, p_id: i.id ?? null, p_customer: i.customerId, p_label: i.label,
    p_address1: i.address1, p_address2: i.address2 ?? null, p_city: i.city, p_state: i.state,
    p_zip: i.zip, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "set_portal_fulfillment_source", description: "Set the warehouse used for customer portal orders",
  roles: ["admin"],
  input: z.object({ locationId: z.string().uuid() }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("set_portal_fulfillment_source", {
    p_brewery: ctx.breweryId, p_location: i.locationId, p_request_id: execution.requestId,
  })),
});

defineQuery({
  name: "list_customers", description: "Customers alphabetical with sale channel name",
  roles: ["admin", "sales", "warehouse"],
  input: z.object({}),
  handler: (ctx) => unwrap(ctx.db.from("customers").select("*, sale_channels(name)").eq("brewery_id", ctx.breweryId).order("name")),
});

defineQuery({
  name: "get_customer", description: "One customer with its sale channel name and ship-tos",
  roles: ["admin", "sales", "warehouse"],
  input: z.object({ customerId: z.string().uuid() }),
  handler: async (ctx, i) => {
    const customer = await unwrap(ctx.db.from("customers").select("*, sale_channels(name)").eq("id", i.customerId).single());
    const shipTos = await unwrap(ctx.db.from("ship_tos").select().eq("customer_id", i.customerId).order("label"));
    return { customer, shipTos };
  },
});

// The price grid (spec 2026-09-07-mgr-pricing-grid-naming): one cell per
// sale channel × price group × format. A SKU's price is its brand's group and
// its format read off its customer's channel — there is no per-SKU exception.
defineQuery({
  name: "list_channel_prices", description: "The price grid: one cell per sale channel × price group × format (integer cents); saleChannelId narrows it to one channel",
  roles: ["admin", "sales"],
  input: z.object({ saleChannelId: z.string().uuid().optional() }),
  handler: (ctx, i) => {
    const q = ctx.db.from("channel_prices").select("*, price_groups(name, position), formats(name)").eq("brewery_id", ctx.breweryId);
    return unwrap(i.saleChannelId ? q.eq("sale_channel_id", i.saleChannelId) : q);
  },
});

defineCommand({
  name: "set_channel_price", description: "Fill one cell of the price grid: every SKU on that group and format sells at it on that channel",
  roles: ["admin", "sales"],
  input: z.object({ saleChannelId: z.string().uuid(), priceGroupId: z.string().uuid(), formatId: z.string().uuid(), unitPriceCents: z.number().int().nonnegative() }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("set_channel_price", {
    p_brewery: ctx.breweryId, p_sale_channel: i.saleChannelId, p_price_group: i.priceGroupId, p_format: i.formatId,
    p_unit_price_cents: i.unitPriceCents, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "clear_channel_price", description: "Empty one cell of the price grid; SKUs on that group and format become unpriced on that channel",
  roles: ["admin", "sales"],
  input: z.object({ saleChannelId: z.string().uuid(), priceGroupId: z.string().uuid(), formatId: z.string().uuid() }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("clear_channel_price", {
    p_brewery: ctx.breweryId, p_sale_channel: i.saleChannelId, p_price_group: i.priceGroupId, p_format: i.formatId, p_request_id: execution.requestId,
  })),
});
