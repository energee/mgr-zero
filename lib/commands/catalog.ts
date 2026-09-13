import { z } from "zod";
import { defineCommand, defineQuery, unwrap, CommandError, STAFF_ROLES } from "./registry";

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
  input: z.object({ brandId: z.string().uuid(), formatId: z.string().uuid(), name: z.string().optional(), upc: z.string().trim().optional() }),
  roles: ["admin", "sales"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("create_sku", {
    p_brewery: ctx.breweryId, p_brand: i.brandId, p_format: i.formatId, p_name: i.name ?? null, p_upc: i.upc || null, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "update_sku", description: "Edit a SKU's active state and optional UPC; brand, format, provider mappings and history stay unchanged",
  input: z.object({ skuId: z.string().uuid(), active: z.boolean(), upc: z.string().trim().optional() }),
  roles: ["admin", "sales"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("update_sku", {
    p_brewery: ctx.breweryId, p_id: i.skuId, p_active: i.active, p_upc: i.upc || null, p_request_id: execution.requestId,
  })),
});

// Formats (§16.2): the physical shape, and the only place bbl_per_unit is
// typed. A poured format holds no stock and carries no package facts.
const KEG_SIZES = ["half_bbl", "quarter_bbl", "sixth_bbl", "fifty_l", "thirty_l", "twenty_l"] as const;
defineCommand({
  name: "upsert_format", description: "Create or edit a format: packaged (holds stock; atomic ones carry bbl_per_unit) or poured (brandId and positive finite ounces required; no package facts, never stock)",
  input: z.object({
    id: z.string().uuid().optional(), name: z.string().trim().min(1), basis: z.enum(["packaged", "poured"]),
    packageType: z.enum(["keg", "can", "bottle"]).optional(), kegSize: z.enum(KEG_SIZES).optional(),
    unitsPerCase: z.number().int().positive().optional(), bblPerUnit: z.number().positive().optional(),
    brandId: z.string().uuid().optional(), ounces: z.number().finite().positive().optional(),
  }).refine((i) => i.basis === "poured"
    ? i.brandId !== undefined && i.ounces !== undefined && [i.packageType, i.kegSize, i.unitsPerCase, i.bblPerUnit].every((v) => v === undefined)
    : i.brandId === undefined && i.ounces === undefined,
  { message: "Pours require a brand and positive ounces, with no package facts; packaged formats cannot have a brand or ounces" }),
  roles: ["admin", "sales"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("upsert_format", {
    p_brewery: ctx.breweryId, p_id: i.id ?? null, p_name: i.name, p_basis: i.basis, p_package_type: i.packageType ?? null,
    p_keg_size: i.kegSize ?? null, p_units_per_case: i.unitsPerCase ?? null, p_bbl_per_unit: i.bblPerUnit ?? null, p_request_id: execution.requestId,
    ...(i.basis === "poured" ? { p_brand: i.brandId, p_ounces: i.ounces } : {}),
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
  name: "list_formats", description: "Formats with brand context, alphabetical; brandId filters a complete brand-owned pour list",
  input: z.object({ basis: z.enum(["packaged", "poured"]).optional(), brandId: z.string().uuid().optional() }), roles: ["admin", "sales", "warehouse", "taproom"],
  handler: (ctx, i) => {
    return completeFormatRows((start) => {
      let q = ctx.db.from("formats").select("*, brands(name)", { count: "exact" }).eq("brewery_id", ctx.breweryId).order("name").order("id");
      if (i.basis) q = q.eq("basis", i.basis);
      if (i.brandId) q = q.eq("brand_id", i.brandId);
      return q.range(start, start + 499);
    });
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
  // Brewers read bins too: packaging output lands in one.
  name: "list_bins", description: "Bins of one location (or all), alphabetical",
  input: z.object({ locationId: z.string().uuid().optional() }), roles: STAFF_ROLES,
  aiExposed: true,
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
// to see it. No channel name is load-bearing: an order carries its own channel,
// so shipping never looks one up by name and every row renames and deletes
// alike (whatever references a channel holds it by on delete restrict).
const TAX_TREATMENTS = ["taxable", "export", "vessel_supplies", "research", "transfer_in_bond"] as const;

defineQuery({
  name: "list_sale_channels", description: "Sale channels with their tax treatment, alphabetical",
  input: z.object({}), roles: ["admin", "sales", "warehouse"],
  aiExposed: true,
  handler: (ctx) => unwrap(ctx.db.from("sale_channels").select("id, name, tax_treatment").eq("brewery_id", ctx.breweryId).order("name")),
});

defineCommand({
  name: "upsert_sale_channel", description: "Create or edit a sale channel: its name and the tax treatment its removals are recorded under",
  input: z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1), taxTreatment: z.enum(TAX_TREATMENTS) }),
  roles: ["admin"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("upsert_sale_channel", {
    p_brewery: ctx.breweryId, p_id: i.id ?? null, p_name: i.name, p_tax_treatment: i.taxTreatment, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "delete_sale_channel", description: "Remove a sale channel nothing references",
  input: z.object({ channelId: z.string().uuid() }),
  roles: ["admin"],
  handler: async (ctx, i, execution) => {
    const result = await ctx.db.rpc("delete_sale_channel", {
      p_brewery: ctx.breweryId, p_id: i.channelId, p_request_id: execution.requestId,
    });
    // inventory_movements, customers, orders and channel_prices all reference
    // the channel `on delete restrict`, so a channel in use comes back as a raw
    // foreign-key violation; say it in product terms rather than letting it
    // fall through to a generic 500.
    if (result.error?.code === "23503") throw new CommandError("channel is in use");
    return unwrap(Promise.resolve(result));
  },
});

// Price groups (spec 2026-09-07-mgr-pricing-grid-naming): the rows of the
// price grid. A brand sits on one; a cell prices that row on a channel for a
// format. Warehouse reads them (they name a brand's price group) but never prices.
defineQuery({
  name: "list_price_groups", description: "Rows of the price grid in position order",
  roles: ["admin", "sales", "warehouse"],
  input: z.object({}),
  handler: (ctx) => unwrap(ctx.db.from("price_groups").select("*").eq("brewery_id", ctx.breweryId).order("position")),
});

// The cost a brand's recipe implies, for the price-group suggestion on Brand.
// Cost is recipe_version_costs (derived from last receipt costs, never
// stored); ingredients with no receipt yet are named so a partial sum is
// never mistaken for the cost. The brand's most recently brewed version
// speaks for it; a never-brewed brand falls back to its newest version.
defineQuery({
  name: "get_brand_recipe_cost", description: "A brand's recipe cost per barrel from its last brewed (else newest) recipe version, naming any ingredient with no receipt cost yet",
  roles: ["admin", "sales"],
  input: z.object({ brandId: z.string().uuid() }),
  handler: async (ctx, i) => {
    const brewed = await unwrap(ctx.db.from("batches").select("recipe_version_id")
      .eq("brewery_id", ctx.breweryId).eq("intended_brand_id", i.brandId).not("brewed_on", "is", null).not("recipe_version_id", "is", null)
      .order("brewed_on", { ascending: false }).limit(1).maybeSingle()) as { recipe_version_id: string } | null;
    const newest = brewed ? null : await unwrap(ctx.db.from("recipe_versions").select("id, recipes!inner(brand_id)")
      .eq("brewery_id", ctx.breweryId).eq("recipes.brand_id", i.brandId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle()) as { id: string } | null;
    const versionId = brewed?.recipe_version_id ?? newest?.id ?? null;
    if (!versionId) return { recipeVersionId: null, costCentsPerBbl: null, uncosted: [] };
    const [cost, ingredients] = await Promise.all([
      unwrap(ctx.db.from("recipe_version_costs").select("cost_cents_per_bbl").eq("recipe_version_id", versionId).maybeSingle()) as Promise<{ cost_cents_per_bbl: number | null } | null>,
      unwrap(ctx.db.from("recipe_ingredients").select("material_id, materials(name)").eq("recipe_version_id", versionId)) as unknown as Promise<{ material_id: string; materials: { name: string } | null }[]>,
    ]);
    const costed = new Set(((await unwrap(ctx.db.from("material_last_cost").select("material_id")
      .in("material_id", ingredients.map((r) => r.material_id)))) as { material_id: string }[]).map((r) => r.material_id));
    const uncosted = ingredients.filter((r) => !costed.has(r.material_id)).map((r) => r.materials?.name ?? "an ingredient");
    return { recipeVersionId: versionId, costCentsPerBbl: cost?.cost_cents_per_bbl ?? null, uncosted };
  },
});

defineCommand({
  name: "upsert_price_group", description: "Create or rename a price group (a row of the price grid), set its position and optional cost ceiling",
  roles: ["admin", "sales"],
  input: z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1), position: z.number().int().positive(), costCeilingCents: z.number().int().nonnegative().optional() }),
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
  // Brewers read brands too: recipes, batches and packaging runs all name one.
  name: "list_brands", description: "Brands with their style and SKUs, alphabetical",
  input: z.object({}), roles: STAFF_ROLES,
  handler: (ctx) => unwrap(ctx.db.from("brands").select("*, styles(name), skus(id, name, format_id, active, upc)").eq("brewery_id", ctx.breweryId).order("name")),
});

// Replacement inputs must include the entire set, even beyond PostgREST's row cap.
async function completeFormatRows<T>(page: (start: number) => PromiseLike<{
  data: T[] | null; error: { message: string; code?: string } | null; count: number | null;
}>): Promise<T[]> {
  const rows: T[] = [];
  let total: number | undefined;
  do {
    const result = await page(rows.length);
    const next = await unwrap(Promise.resolve(result));
    if (result.count === null || (total !== undefined && result.count !== total) || !next
      || (next.length === 0 && rows.length < result.count)) {
      throw new CommandError("The complete format could not be loaded. Reload before editing.", 409, "conflict");
    }
    total = result.count;
    rows.push(...next);
  } while (rows.length < total);
  return rows;
}

// Format editing needs only material identity/unit, not purchasing details.
defineQuery({
  name: "get_format_composition", description: "One format with its components, packaging BOM, atomic child options, and material names and base units",
  input: z.object({ formatId: z.string().uuid() }), roles: ["admin", "sales", "warehouse"],
  handler: async (ctx, i) => {
    const format = await unwrap(ctx.db.from("formats").select("*, brands(name)").eq("brewery_id", ctx.breweryId).eq("id", i.formatId).maybeSingle());
    if (!format) throw new CommandError("Format not found", 404, "not_found");
    const [components, lines, formats, materials, parents] = await Promise.all([
      completeFormatRows((start) => ctx.db.from("format_components").select("child_format_id, qty", { count: "exact" }).eq("brewery_id", ctx.breweryId).eq("parent_format_id", i.formatId).order("child_format_id").range(start, start + 499)),
      completeFormatRows((start) => ctx.db.from("format_bom").select("material_id, qty_per_unit, on_break", { count: "exact" }).eq("brewery_id", ctx.breweryId).eq("format_id", i.formatId).order("material_id").range(start, start + 499)),
      completeFormatRows((start) => ctx.db.from("format_volumes").select("id, name, basis, bbl_per_unit, composed", { count: "exact" }).eq("brewery_id", ctx.breweryId).order("name").order("id").range(start, start + 499)),
      completeFormatRows((start) => ctx.db.from("materials").select("id, name, base_uom, active", { count: "exact" }).eq("brewery_id", ctx.breweryId).order("name").order("id").range(start, start + 499)),
      unwrap(ctx.db.from("format_components").select("parent_format_id").eq("brewery_id", ctx.breweryId).eq("child_format_id", i.formatId).limit(1)),
    ]);
    return { format, components, lines, formats, materials, usedAsChild: (parents ?? []).length > 0 };
  },
});
