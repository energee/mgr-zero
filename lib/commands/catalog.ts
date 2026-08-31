import { z } from "zod";
import { defineCommand, defineQuery, unwrap } from "./registry";

defineCommand({
  name: "create_product", description: "Create a beer brand/product",
  input: z.object({ name: z.string().min(1), style: z.string().optional(), abv: z.number().optional() }),
  roles: ["admin", "sales"],
  handler: (ctx, i) =>
    unwrap(ctx.db.from("products").insert({ brewery_id: ctx.breweryId, name: i.name, style: i.style, abv: i.abv }).select().single()),
});

defineCommand({
  name: "create_sku", description: "Create a sellable format of a product",
  input: z.object({
    productId: z.string().uuid(), name: z.string().min(1),
    packageType: z.enum(["keg", "can", "bottle"]), unitsPerCase: z.number().int().optional(),
    bblPerUnit: z.string().regex(/^\d+(\.\d+)?$/, "numeric string"), // string preserves exact numeric
  }),
  roles: ["admin", "sales"],
  handler: (ctx, i) =>
    unwrap(ctx.db.from("skus").insert({
      brewery_id: ctx.breweryId, product_id: i.productId, name: i.name,
      package_type: i.packageType, units_per_case: i.unitsPerCase, bbl_per_unit: i.bblPerUnit,
    }).select().single()),
});

defineCommand({
  name: "create_location", description: "Create a warehouse or taproom location",
  input: z.object({ name: z.string().min(1), kind: z.enum(["warehouse", "taproom"]) }),
  roles: ["admin"],
  handler: (ctx, i) => unwrap(ctx.db.from("locations").insert({ brewery_id: ctx.breweryId, ...i }).select().single()),
});

defineQuery({
  name: "list_products", description: "Products with their SKUs, alphabetical",
  input: z.object({}), roles: ["admin", "sales", "warehouse"],
  handler: (ctx) => unwrap(ctx.db.from("products").select("*, skus(*)").eq("brewery_id", ctx.breweryId).order("name")),
});
