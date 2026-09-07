import { z } from "zod";
import { defineCommand, defineQuery, unwrap, CommandError } from "./registry";

// Brands (§16.1): the sellable identity. Style is found or created in the
// brewery's own styles list; description, category, price group and hops are
// the optional Brand-screen facts.
defineCommand({
  name: "upsert_brand", description: "Create or edit a brand: name, style (added to the brewery's styles when new), ABV, and optional description, category, price group, hops",
  input: z.object({
    id: z.string().uuid().optional(), name: z.string().trim().min(1), style: z.string().optional(), abv: z.number().optional(),
    description: z.string().optional(), category: z.string().optional(), priceGroupId: z.string().uuid().optional(), hops: z.string().optional(),
  }),
  roles: ["admin", "sales"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("upsert_brand", {
    p_brewery: ctx.breweryId, p_id: i.id ?? null, p_name: i.name, p_style: i.style ?? null, p_abv: i.abv ?? null,
    p_description: i.description ?? null, p_category: i.category ?? null, p_price_group: i.priceGroupId ?? null, p_hops: i.hops ?? null,
    p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "create_sku", description: "Create a SKU: one brand × one packaged format; the name defaults to brand · format",
  input: z.object({ brandId: z.string().uuid(), formatId: z.string().uuid(), name: z.string().optional(), upc: z.string().optional() }),
  roles: ["admin", "sales"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("create_sku", {
    p_brewery: ctx.breweryId, p_brand: i.brandId, p_format: i.formatId, p_name: i.name ?? null, p_upc: i.upc ?? null, p_request_id: execution.requestId,
  })),
});

// Formats (§16.2): the physical shape, and the only place bbl_per_unit is
// typed. A poured format holds no stock and carries no package facts.
const KEG_SIZES = ["half_bbl", "quarter_bbl", "sixth_bbl", "fifty_l", "thirty_l", "twenty_l"] as const;
defineCommand({
  name: "upsert_format", description: "Create or edit a format: packaged (holds stock; atomic ones carry bbl_per_unit) or poured (a glass, never stock)",
  input: z.object({
    id: z.string().uuid().optional(), name: z.string().trim().min(1), basis: z.enum(["packaged", "poured"]),
    packageType: z.enum(["keg", "can", "bottle"]).optional(), kegSize: z.enum(KEG_SIZES).optional(),
    unitsPerCase: z.number().int().positive().optional(), bblPerUnit: z.number().positive().optional(),
  }),
  roles: ["admin", "sales"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("upsert_format", {
    p_brewery: ctx.breweryId, p_id: i.id ?? null, p_name: i.name, p_basis: i.basis, p_package_type: i.packageType ?? null,
    p_keg_size: i.kegSize ?? null, p_units_per_case: i.unitsPerCase ?? null, p_bbl_per_unit: i.bblPerUnit ?? null, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "replace_format_components", description: "Replace a composed format's children (one level: atomic packaged children); its volume is derived from them",
  input: z.object({ formatId: z.string().uuid(), components: z.array(z.object({ childFormatId: z.string().uuid(), qty: z.number().positive() })) }),
  roles: ["admin", "sales"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("replace_format_components", {
    p_brewery: ctx.breweryId, p_format: i.formatId, p_components: i.components.map((c) => ({ child_format_id: c.childFormatId, qty: c.qty })), p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "replace_format_bom", description: "Replace a format's packaging bill of materials: material, qty per unit, and what happens to it on break (consumed or return_to_stock)",
  input: z.object({ formatId: z.string().uuid(), lines: z.array(z.object({ materialId: z.string().uuid(), qtyPerUnit: z.number().positive(), onBreak: z.enum(["consumed", "return_to_stock"]).default("consumed") })) }),
  roles: ["admin", "sales"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("replace_format_bom", {
    p_brewery: ctx.breweryId, p_format: i.formatId, p_lines: i.lines.map((l) => ({ material_id: l.materialId, qty_per_unit: l.qtyPerUnit, on_break: l.onBreak })), p_request_id: execution.requestId,
  })),
});

defineQuery({
  name: "list_formats", description: "Formats, alphabetical, packaged and poured",
  input: z.object({ basis: z.enum(["packaged", "poured"]).optional() }), roles: ["admin", "sales", "warehouse"],
  handler: (ctx, i) => {
    let q = ctx.db.from("formats").select().eq("brewery_id", ctx.breweryId).order("name");
    if (i.basis) q = q.eq("basis", i.basis);
    return unwrap(q);
  },
});

defineCommand({
  name: "create_location", description: "Create a warehouse, taproom or storage location; it starts with the Walk-in, Cold and Dry bins",
  input: z.object({ name: z.string().min(1), kind: z.enum(["warehouse", "taproom", "storage"]) }),
  roles: ["admin"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("create_location", {
    p_brewery: ctx.breweryId, p_name: i.name, p_kind: i.kind, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "update_location", description: "Rename a location or change its kind (warehouse, taproom or storage); movement history is untouched",
  input: z.object({ locationId: z.string().uuid(), name: z.string().trim().min(1), kind: z.enum(["warehouse", "taproom", "storage"]) }),
  roles: ["admin"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("update_location", {
    p_brewery: ctx.breweryId, p_id: i.locationId, p_name: i.name, p_kind: i.kind, p_request_id: execution.requestId,
  })),
});

// Bins subdivide a location (spec 2026-09-06 Decision 1). Reads go through
// RLS; the three writes are the idempotent RPCs. A location never drops below
// one bin and a bin that ever recorded stock is not deleted — delete_bin raises both.
defineQuery({
  name: "list_bins", description: "Bins of one location (or all), alphabetical",
  input: z.object({ locationId: z.string().uuid().optional() }), roles: ["admin", "sales", "warehouse"],
  handler: (ctx, i) => {
    let q = ctx.db.from("bins").select("id, location_id, name").eq("brewery_id", ctx.breweryId).order("name");
    if (i.locationId) q = q.eq("location_id", i.locationId);
    return unwrap(q);
  },
});

defineCommand({
  name: "create_bin", description: "Add a bin to a location",
  input: z.object({ locationId: z.string().uuid(), name: z.string().min(1) }),
  roles: ["admin", "warehouse"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("create_bin", {
    p_brewery: ctx.breweryId, p_location: i.locationId, p_name: i.name, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "update_bin", description: "Rename a bin",
  input: z.object({ binId: z.string().uuid(), name: z.string().min(1) }),
  roles: ["admin", "warehouse"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("update_bin", {
    p_brewery: ctx.breweryId, p_bin: i.binId, p_name: i.name, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "delete_bin", description: "Remove an empty bin; a location keeps at least one",
  input: z.object({ binId: z.string().uuid() }),
  roles: ["admin", "warehouse"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("delete_bin", {
    p_brewery: ctx.breweryId, p_bin: i.binId, p_request_id: execution.requestId,
  })),
});

// Sale channels (§16.3): the brewery's own list of what a removal is sold
// through, each with the tax treatment frozen onto the movements it classifies.
// Editing the list is admin work; anyone who records or reads a movement needs
// to see it. 'Wholesale' is pinned by name because private.ship_order_impl
// looks it up that way — the RPCs refuse to rename or delete that row.
const TAX_TREATMENTS = ["taxable", "export", "vessel_supplies", "research", "transfer_in_bond"] as const;

defineQuery({
  name: "list_sale_channels", description: "Sale channels with their tax treatment, alphabetical",
  input: z.object({}), roles: ["admin", "sales", "warehouse"],
  handler: (ctx) => unwrap(ctx.db.from("sale_channels").select("id, name, tax_treatment").eq("brewery_id", ctx.breweryId).order("name")),
});

defineCommand({
  name: "upsert_sale_channel", description: "Create or edit a sale channel: its name and the tax treatment its removals are recorded under; Wholesale cannot be renamed",
  input: z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1), taxTreatment: z.enum(TAX_TREATMENTS) }),
  roles: ["admin"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("upsert_sale_channel", {
    p_brewery: ctx.breweryId, p_id: i.id ?? null, p_name: i.name, p_tax_treatment: i.taxTreatment, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "delete_sale_channel", description: "Remove a sale channel no movement has used; Wholesale cannot be removed",
  input: z.object({ channelId: z.string().uuid() }),
  roles: ["admin"],
  handler: async (ctx, i, execution) => {
    const result = await ctx.db.rpc("delete_sale_channel", {
      p_brewery: ctx.breweryId, p_id: i.channelId, p_request_id: execution.requestId,
    });
    // inventory_movements references the channel `on delete restrict`, so a
    // used channel comes back as a raw foreign-key violation; say it in
    // product terms rather than letting it fall through to a generic 500.
    if (result.error?.code === "23503") throw new CommandError("channel is in use");
    return unwrap(Promise.resolve(result));
  },
});

// Price groups (spec 2026-09-07-mgr-pricing-grid-naming): the rows of the
// price grid. A brand sits on one; a cell prices that row on a channel for a
// format. Warehouse reads them (they name a brand's tier) but never prices.
defineQuery({
  name: "list_price_groups", description: "Rows of the price grid in position order",
  roles: ["admin", "sales", "warehouse"],
  input: z.object({}),
  handler: (ctx) => unwrap(ctx.db.from("price_groups").select("*").eq("brewery_id", ctx.breweryId).order("position")),
});

defineCommand({
  name: "upsert_price_group", description: "Create or rename a price group (a row of the price grid), set its position and optional cost ceiling",
  roles: ["admin", "sales"],
  input: z.object({ id: z.string().uuid().optional(), name: z.string().min(1), position: z.number().int().positive(), costCeilingCents: z.number().int().nonnegative().optional() }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("upsert_price_group", {
    p_brewery: ctx.breweryId, p_id: i.id ?? null, p_name: i.name, p_position: i.position, p_cost_ceiling_cents: i.costCeilingCents ?? null, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "delete_price_group", description: "Remove a price group no brand sits on and no cell prices",
  roles: ["admin", "sales"],
  input: z.object({ priceGroupId: z.string().uuid() }),
  handler: async (ctx, i, execution) => {
    const result = await ctx.db.rpc("delete_price_group", { p_brewery: ctx.breweryId, p_id: i.priceGroupId, p_request_id: execution.requestId });
    // brands and channel_prices reference the group `on delete restrict`, so a
    // group still in use comes back as a raw foreign-key violation; say it in
    // product terms rather than letting it fall through to a generic 500.
    if (result.error?.code === "23503") throw new CommandError("price group is in use");
    return unwrap(Promise.resolve(result));
  },
});

defineQuery({
  name: "list_brands", description: "Brands with their style and SKUs, alphabetical",
  input: z.object({}), roles: ["admin", "sales", "warehouse"],
  handler: (ctx) => unwrap(ctx.db.from("brands").select("*, styles(name), skus(id, name, format_id, active)").eq("brewery_id", ctx.breweryId).order("name")),
});
