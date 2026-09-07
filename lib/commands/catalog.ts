import { z } from "zod";
import { defineCommand, defineQuery, unwrap } from "./registry";

defineCommand({
  name: "create_product", description: "Create a beer brand/product",
  input: z.object({ name: z.string().min(1), style: z.string().optional(), abv: z.number().optional() }),
  roles: ["admin", "sales"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("create_product", {
    p_brewery: ctx.breweryId, p_name: i.name, p_style: i.style ?? null, p_abv: i.abv ?? null,
    p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "create_sku", description: "Create a sellable format of a product",
  input: z.object({
    productId: z.string().uuid(), name: z.string().min(1),
    packageType: z.enum(["keg", "can", "bottle"]), unitsPerCase: z.number().int().optional(),
    bblPerUnit: z.string().regex(/^\d+(\.\d+)?$/, "numeric string"), // string preserves exact numeric
  }),
  roles: ["admin", "sales"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("create_sku", {
    p_brewery: ctx.breweryId, p_product: i.productId, p_name: i.name,
    p_package_type: i.packageType, p_units_per_case: i.unitsPerCase ?? null,
    p_bbl_per_unit: i.bblPerUnit, p_request_id: execution.requestId,
  })),
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

defineQuery({
  name: "list_products", description: "Products with their SKUs, alphabetical",
  input: z.object({}), roles: ["admin", "sales", "warehouse"],
  handler: (ctx) => unwrap(ctx.db.from("products").select("*, skus(*)").eq("brewery_id", ctx.breweryId).order("name")),
});
