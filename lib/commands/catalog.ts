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

defineQuery({
  name: "list_products", description: "Products with their SKUs, alphabetical",
  input: z.object({}), roles: ["admin", "sales", "warehouse"],
  handler: (ctx) => unwrap(ctx.db.from("products").select("*, skus(*)").eq("brewery_id", ctx.breweryId).order("name")),
});
