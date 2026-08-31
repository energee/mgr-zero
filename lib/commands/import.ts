// lib/commands/import.ts — bulk CSV import for customers, ship-tos, catalog,
// price lists, and opening balances. One command (`import_csv`) dispatches by
// `kind` to a per-kind row inserter; every referenced entity (SKU, location,
// customer, product, price list) is resolved by name scoped to
// ctx.breweryId, creating catalog/price-list parents on the fly when missing.
// Per-row failures are collected into `errors` rather than thrown, so a bad
// row never aborts the good ones in the same batch.
import { z } from "zod";
import { defineCommand, CommandError, Ctx } from "./registry";
import { insertMovement } from "./inventory";

const rowsSchema = z.array(z.record(z.string(), z.string()));

type ImportResult = { inserted: number; errors: { row: number; message: string }[] };

function requireField(row: Record<string, string>, field: string): string {
  const value = row[field]?.trim();
  if (!value) throw new Error(`missing required field: ${field}`);
  return value;
}

// Parses a numeric field, rejecting non-numeric values loudly rather than
// letting Number() produce NaN, which serializes to null over the wire and
// silently drops data into a nullable column. Blank/absent stays `undefined`
// (legitimate null) only when the field is optional.
function parseNumericField(row: Record<string, string>, field: string, opts: { optional: true }): number | undefined;
function parseNumericField(row: Record<string, string>, field: string, opts?: { optional?: false }): number;
function parseNumericField(row: Record<string, string>, field: string, opts?: { optional?: boolean }): number | undefined {
  const raw = row[field]?.trim();
  if (!raw) {
    if (opts?.optional) return undefined;
    throw new Error(`missing required field: ${field}`);
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`invalid number for ${field}: "${raw}"`);
  return n;
}

// Same validation as parseNumericField, but returns the original string so
// exact-decimal columns (bbl_per_unit) aren't coerced through a float.
function parseNumericString(row: Record<string, string>, field: string): string {
  const raw = requireField(row, field);
  if (!/^-?\d+(\.\d+)?$/.test(raw)) throw new Error(`invalid number for ${field}: "${raw}"`);
  return raw;
}

async function importCustomers(ctx: Ctx, rows: Record<string, string>[]): Promise<ImportResult> {
  const errors: ImportResult["errors"] = [];
  let inserted = 0;
  for (let row = 0; row < rows.length; row++) {
    try {
      const r = rows[row];
      const name = requireField(r, "name");
      const state = requireField(r, "state");
      const { error } = await ctx.db.from("customers").insert({
        brewery_id: ctx.breweryId,
        name,
        type: r.type?.trim() || undefined,
        license_no: r.license_no?.trim() || null,
        state,
        payment_terms: r.payment_terms?.trim() || undefined,
      });
      if (error) throw new Error(error.message);
      inserted++;
    } catch (e) {
      errors.push({ row, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return { inserted, errors };
}

async function importShipTos(ctx: Ctx, rows: Record<string, string>[]): Promise<ImportResult> {
  const errors: ImportResult["errors"] = [];
  let inserted = 0;
  for (let row = 0; row < rows.length; row++) {
    try {
      const r = rows[row];
      const customerName = requireField(r, "customer_name");
      const label = requireField(r, "label");
      const address1 = requireField(r, "address1");
      const city = requireField(r, "city");
      const state = requireField(r, "state");
      const zip = requireField(r, "zip");
      const { data: customer, error: ce } = await ctx.db
        .from("customers").select("id").eq("brewery_id", ctx.breweryId).eq("name", customerName).maybeSingle();
      if (ce) throw new Error(ce.message);
      if (!customer) throw new Error(`customer not found: ${customerName}`);
      const { error } = await ctx.db.from("ship_tos").insert({
        brewery_id: ctx.breweryId, customer_id: customer.id, label, address1, city, state, zip,
      });
      if (error) throw new Error(error.message);
      inserted++;
    } catch (e) {
      errors.push({ row, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return { inserted, errors };
}

async function findOrCreateProduct(ctx: Ctx, name: string, style: string | undefined, abv: number | undefined) {
  const { data: existing, error: fe } = await ctx.db
    .from("products").select("id").eq("brewery_id", ctx.breweryId).eq("name", name).maybeSingle();
  if (fe) throw new Error(fe.message);
  if (existing) return existing.id as string;
  const { data: created, error: ie } = await ctx.db
    .from("products").insert({ brewery_id: ctx.breweryId, name, style: style || null, abv: abv ?? null })
    .select("id").single();
  if (ie) throw new Error(ie.message);
  return created.id as string;
}

async function importProductsSkus(ctx: Ctx, rows: Record<string, string>[]): Promise<ImportResult> {
  const errors: ImportResult["errors"] = [];
  let inserted = 0;
  for (let row = 0; row < rows.length; row++) {
    try {
      const r = rows[row];
      const productName = requireField(r, "product");
      const skuName = requireField(r, "sku_name");
      const packageType = requireField(r, "package_type");
      const bblPerUnit = parseNumericString(r, "bbl_per_unit");
      const abv = parseNumericField(r, "abv", { optional: true });
      const unitsPerCase = parseNumericField(r, "units_per_case", { optional: true }) ?? null;
      const productId = await findOrCreateProduct(ctx, productName, r.style?.trim(), abv);
      const { error } = await ctx.db.from("skus").insert({
        brewery_id: ctx.breweryId, product_id: productId, name: skuName,
        package_type: packageType, units_per_case: unitsPerCase, bbl_per_unit: bblPerUnit,
      });
      if (error) throw new Error(error.message);
      inserted++;
    } catch (e) {
      errors.push({ row, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return { inserted, errors };
}

async function findOrCreatePriceList(ctx: Ctx, name: string) {
  const { data: existing, error: fe } = await ctx.db
    .from("price_lists").select("id").eq("brewery_id", ctx.breweryId).eq("name", name).maybeSingle();
  if (fe) throw new Error(fe.message);
  if (existing) return existing.id as string;
  const { data: created, error: ie } = await ctx.db
    .from("price_lists").insert({ brewery_id: ctx.breweryId, name }).select("id").single();
  if (ie) throw new Error(ie.message);
  return created.id as string;
}

async function importPriceListItems(ctx: Ctx, rows: Record<string, string>[]): Promise<ImportResult> {
  const errors: ImportResult["errors"] = [];
  let inserted = 0;
  for (let row = 0; row < rows.length; row++) {
    try {
      const r = rows[row];
      const priceListName = requireField(r, "price_list");
      const skuName = requireField(r, "sku_name");
      const unitPriceCents = parseNumericField(r, "unit_price_cents");
      const { data: sku, error: se } = await ctx.db
        .from("skus").select("id").eq("brewery_id", ctx.breweryId).eq("name", skuName).maybeSingle();
      if (se) throw new Error(se.message);
      if (!sku) throw new Error(`sku not found: ${skuName}`);
      const priceListId = await findOrCreatePriceList(ctx, priceListName);
      const { error } = await ctx.db.from("price_list_items").insert({
        brewery_id: ctx.breweryId, price_list_id: priceListId, sku_id: sku.id, unit_price_cents: unitPriceCents,
      });
      if (error) throw new Error(error.message);
      inserted++;
    } catch (e) {
      errors.push({ row, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return { inserted, errors };
}

async function importOpeningBalances(ctx: Ctx, rows: Record<string, string>[]): Promise<ImportResult> {
  const errors: ImportResult["errors"] = [];
  let inserted = 0;
  for (let row = 0; row < rows.length; row++) {
    try {
      const r = rows[row];
      const skuName = requireField(r, "sku_name");
      const locationName = requireField(r, "location");
      const qty = parseNumericField(r, "qty");
      if (qty === 0) throw new Error(`invalid value for qty: "0" (qty cannot be 0)`);
      const { data: sku, error: se } = await ctx.db
        .from("skus").select("id").eq("brewery_id", ctx.breweryId).eq("name", skuName).maybeSingle();
      if (se) throw new Error(se.message);
      if (!sku) throw new Error(`sku not found: ${skuName}`);
      const { data: location, error: le } = await ctx.db
        .from("locations").select("id").eq("brewery_id", ctx.breweryId).eq("name", locationName).maybeSingle();
      if (le) throw new Error(le.message);
      if (!location) throw new Error(`location not found: ${locationName}`);
      await insertMovement(ctx, { skuId: sku.id, locationId: location.id, qty, type: "opening_balance" });
      inserted++;
    } catch (e) {
      errors.push({ row, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return { inserted, errors };
}

defineCommand({
  name: "import_csv",
  description: "Bulk-import customers, ship-tos, catalog, price lists, or opening balances from CSV rows",
  input: z.object({
    kind: z.enum(["customers", "ship_tos", "products_skus", "price_list_items", "opening_balances"]),
    rows: rowsSchema,
  }),
  roles: ["admin"],
  handler: async (ctx, i) => {
    switch (i.kind) {
      case "customers": return importCustomers(ctx, i.rows);
      case "ship_tos": return importShipTos(ctx, i.rows);
      case "products_skus": return importProductsSkus(ctx, i.rows);
      case "price_list_items": return importPriceListItems(ctx, i.rows);
      case "opening_balances": return importOpeningBalances(ctx, i.rows);
      default: throw new CommandError(`unknown import kind`);
    }
  },
});
