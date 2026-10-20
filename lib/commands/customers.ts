// lib/commands/customers.ts — customer / ship-to CRUD and the price grid's
// cells (channel × price group × format). Single-row writes call one explicit
// security-definer RPC; pass `id` to update, omit to create.
import { z } from "zod";
import { cents, CommandError, completeRows, countryCode, defineCommand, defineQuery, PAGE_SIZE, stateCode, unwrap } from "./registry";
import { CUSTOMER_TYPES, PAYMENT_TERMS } from "@/lib/mgr/enums";
import { escapeRegex } from "@/lib/escape-regex";
import { hasAnyRole } from "@/lib/mgr/roles";

const roles = ["admin", "sales"] as const;

/** An ISO alpha-2 country, US when omitted. Only a US customer or ship-to has a state. */
const country = countryCode.default("US");
/** customers_state_by_country and ship_tos_state_by_country, stated at the command boundary. */
const stateByCountry = { path: ["state"], message: "a US address needs a state; other countries have none" };
const hasStateIffUs = (i: { country: string; state?: string }) => (i.country === "US") === (i.state !== undefined);

defineCommand({
  name: "delete_customer", description: "Delete an unused customer and its ship-to addresses; preserve linked history, portal access, invitations and QuickBooks customers",
  roles: ["admin"],
  input: z.object({ customerId: z.string().uuid() }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("delete_customer", {
    p_brewery: ctx.breweryId, p_id: i.customerId, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "upsert_customer", description: "Create or update a customer account: its sale channel decides its prices and where its removals post; tax treatment may override the channel default",
  roles: [...roles],
  input: z.object({
    id: z.string().uuid().optional(), name: z.string().min(1),
    // Staff only, like a brand alias; an edit without it clears it.
    alias: z.string().trim().min(1).optional(),
    type: z.enum(CUSTOMER_TYPES),
    country,
    state: stateCode.optional(), // home state, required for a US customer only
    // The channel is the customer's row into the price grid (§16.3) and is required.
    saleChannelId: z.string().uuid(),
    licenseNumber: z.string().optional(),
    // The vendor list (#491); omit it to keep the current term (net30 on create).
    paymentTerms: z.enum(PAYMENT_TERMS).optional(),
    // Overrides the sale channel's tax treatment for this customer's removals
    // (§16.3); omit it to inherit the channel default.
    taxTreatment: z.enum(["taxable", "export", "vessel_supplies", "research", "transfer_in_bond"]).optional(),
  }).refine(hasStateIffUs, stateByCountry),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("upsert_customer", {
    p_brewery: ctx.breweryId, p_id: i.id ?? null, p_name: i.name, p_type: i.type, p_state: i.state ?? null,
    p_sale_channel: i.saleChannelId, p_license_no: i.licenseNumber ?? null,
    p_payment_terms: i.paymentTerms ?? null, p_tax_treatment: i.taxTreatment ?? null, p_request_id: execution.requestId,
    p_alias: i.alias ?? null, p_country: i.country,
  })),
});

defineCommand({
  name: "upsert_ship_to", description: "Create or update a ship-to address; isDefault switches the customer default, omission preserves it on edit; addresses cannot change customer",
  roles: [...roles],
  // A ship-to needs its label and country, and a US one its state: enough for the
  // TTB destination (user, 2026-10-15). Street, city and ZIP stay optional until
  // known; a US ZIP, when given, must be valid.
  input: z.object({
    id: z.string().uuid().optional(), customerId: z.string().uuid(), label: z.string().min(1),
    country,
    address1: z.string().min(1).optional(), address2: z.string().optional(),
    city: z.string().min(1).optional(), state: stateCode.optional(), zip: z.string().trim().min(1).optional(),
    isDefault: z.boolean().optional(),
  }).refine(hasStateIffUs, stateByCountry)
    // `when` runs the ZIP shape check even while another field is missing.
    .refine(i => i.country !== "US" || !i.zip || /^\d{5}(-\d{4})?$/.test(i.zip), {
      path: ["zip"], message: "a 5-digit ZIP code or ZIP+4", when: p => typeof (p.value as { zip?: unknown } | undefined)?.zip === "string",
    }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("upsert_ship_to", {
    p_brewery: ctx.breweryId, p_id: i.id ?? null, p_customer: i.customerId, p_label: i.label,
    p_address1: i.address1 ?? null, p_address2: i.address2 ?? null, p_city: i.city ?? null, p_state: i.state ?? null,
    p_zip: i.zip ?? null, p_request_id: execution.requestId, p_is_default: i.isDefault ?? null, p_country: i.country,
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
  name: "list_customers", description: "Customers alphabetical with sale channel name; optionally only those whose name or alias contains q",
  roles: ["admin", "sales", "warehouse"],
  input: z.object({
    includeShipTos: z.boolean().optional().describe("Include ship-to picker options for each customer"),
    missingPortalEmail: z.boolean().optional().describe("Admin/Sales only: customers without a current portal login email"),
    q: z.string().trim().max(100).optional().describe("Only customers whose name or alias contains this text"),
  }),
  // Paged past PostgREST's 1000-row cap (#475); id breaks name ties so pages never overlap.
  handler: (ctx, i) => {
    if (i.missingPortalEmail && !hasAnyRole(ctx.roles, ["admin", "sales"])) throw new CommandError("permission denied", 403, "permission_denied");
    // An unanchored imatch is a case-insensitive contains. A PostgREST or() value is double-quoted, so `"` and `\`
    // (including escapeRegex's) are escaped again, as list_brands does.
    const pattern = i.q && `"${escapeRegex(i.q).replace(/["\\]/g, (c) => `\\${c}`)}"`;
    return completeRows("Customer list", start => {
    const columns = i.includeShipTos ? "*, sale_channels(name), shipTos:ship_tos(id, label, is_default)" : "*, sale_channels(name)";
    const base = i.missingPortalEmail
      ? ctx.db.rpc("customers_missing_portal_email", { p_brewery: ctx.breweryId }, { count: "exact" }).select(columns)
      : ctx.db.from("customers").select(columns, { count: "exact" }).eq("brewery_id", ctx.breweryId);
    const query = (pattern ? base.or(`name.imatch.${pattern},alias.imatch.${pattern}`) : base).order("name").order("id");
    return (i.includeShipTos ? query.order("label", { referencedTable: "shipTos" }) : query).range(start, start + PAGE_SIZE - 1);
    });
  },
});

defineQuery({
  name: "count_customers_missing_portal_email", description: "Count customers without a current portal login email; presence does not imply deliverability or sending",
  roles: [...roles], input: z.object({}),
  handler: async ctx => {
    const result = await ctx.db.rpc("customers_missing_portal_email", { p_brewery: ctx.breweryId }, { count: "exact", head: true });
    await unwrap(Promise.resolve(result));
    if (result.count === null) throw new CommandError("Email readiness count unavailable", 500, "db_error");
    return result.count;
  },
});

defineQuery({
  name: "get_customer", description: "One customer with its sale channel name and ship-tos",
  roles: ["admin", "sales", "warehouse"],
  input: z.object({ customerId: z.string().uuid() }),
  handler: async (ctx, i) => {
    const customer = await unwrap(ctx.db.from("customers").select("*, sale_channels(name)").eq("brewery_id", ctx.breweryId).eq("id", i.customerId).single());
    const shipTos = await unwrap(ctx.db.from("ship_tos").select().eq("brewery_id", ctx.breweryId).eq("customer_id", i.customerId).order("label"));
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
  // Paged past PostgREST's 1000-row cap (#424): channels × groups × formats
  // outgrows it. Ordered by the primary key so pages never overlap.
  handler: (ctx, i) => completeRows("Price grid", start => {
    const q = ctx.db.from("channel_prices").select("*, price_groups(name, position), formats(name)", { count: "exact" }).eq("brewery_id", ctx.breweryId);
    return (i.saleChannelId ? q.eq("sale_channel_id", i.saleChannelId) : q)
      .order("sale_channel_id").order("price_group_id").order("format_id").range(start, start + PAGE_SIZE - 1);
  }),
});

defineCommand({
  name: "set_channel_price", description: "Fill one cell of the price grid: every SKU on that group and format sells at it on that channel",
  roles: ["admin", "sales"],
  input: z.object({ saleChannelId: z.string().uuid(), priceGroupId: z.string().uuid(), formatId: z.string().uuid(), unitPriceCents: cents }),
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
