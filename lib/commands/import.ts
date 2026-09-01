// lib/commands/import.ts — bulk CSV import for customers, ship-tos, catalog,
// price lists, and opening balances. One command (`import_csv`) dispatches by
// `kind` to a per-row inserter; referenced entities are resolved by name
// within ctx.breweryId, creating catalog/price-list parents on the fly.
// Per-row failures are collected into `errors` rather than thrown, so a bad
// row never aborts the good ones in the same batch.
// atomic-exempt: rows are independent by design and re-import is idempotent
// by name; a customer row's customer+ship_to pair is the one non-atomic pair.
import { z } from "zod";
import { defineCommand, runCommand, unwrap, CommandError, Ctx } from "./registry";
import { insertMovement } from "./inventory";
import { IMPORT_ROW_CAP } from "./import-limits";

type Row = Record<string, string>;
type ImportResult = { inserted: number; errors: { row: number; message: string }[] };

// Runs `fn` once per row, collecting failures instead of aborting the batch.
async function runRowImport(rows: Row[], fn: (r: Row) => Promise<void>): Promise<ImportResult> {
  const errors: ImportResult["errors"] = [];
  let inserted = 0;
  for (let row = 0; row < rows.length; row++) {
    try {
      await fn(rows[row]);
      inserted++;
    } catch (e) {
      errors.push({ row, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return { inserted, errors };
}

// A per-import-run memo: the same SKU/location/customer name recurs across
// hundreds of rows, and each would otherwise be a fresh round-trip.
function memo<T>(cache: Map<string, Promise<T>>, key: string, fn: () => Promise<T>) {
  let p = cache.get(key);
  if (!p) { p = fn(); cache.set(key, p); }
  return p;
}
type Lookups = Record<"product" | "priceList" | "sku" | "location" | "customer", Map<string, Promise<string>>>;
const newLookups = (): Lookups => ({ product: new Map(), priceList: new Map(), sku: new Map(), location: new Map(), customer: new Map() });

function requireField(row: Row, field: string): string {
  const value = row[field]?.trim();
  if (!value) throw new Error(`missing required field: ${field}`);
  return value;
}

// Validates a numeric field by shape and returns the ORIGINAL string, so
// exact-decimal columns (bbl_per_unit) are never coerced through a float and
// garbage ("n/a") is rejected loudly instead of becoming NaN → null on the
// wire. Blank stays undefined (a legitimate null) only when optional.
function numericString(row: Row, field: string, opts: { optional: true }): string | undefined;
function numericString(row: Row, field: string, opts?: { optional?: false }): string;
function numericString(row: Row, field: string, opts?: { optional?: boolean }): string | undefined {
  const raw = row[field]?.trim();
  if (!raw) {
    if (opts?.optional) return undefined;
    throw new Error(`missing required field: ${field}`);
  }
  if (!/^-?\d+(\.\d+)?$/.test(raw)) throw new Error(`invalid number for ${field}: "${raw}"`);
  return raw;
}
const numberField = (row: Row, field: string) => Number(numericString(row, field));
function optionalNumber(row: Row, field: string) {
  const s = numericString(row, field, { optional: true });
  return s === undefined ? undefined : Number(s);
}
// unit_price_cents is an integer column; "12.5" almost always means dollars.
function integerField(row: Row, field: string): number {
  const raw = numericString(row, field);
  if (!/^-?\d+$/.test(raw)) throw new Error(`invalid integer for ${field}: "${raw}"`);
  return Number(raw);
}

// --- name → id resolvers (all scoped to ctx.breweryId) -----------------------

async function findId(ctx: Ctx, table: string, name: string): Promise<string | null> {
  const row = await unwrap(ctx.db.from(table).select("id").eq("brewery_id", ctx.breweryId).eq("name", name).maybeSingle());
  return row?.id ?? null;
}
async function requireId(ctx: Ctx, table: string, name: string, label: string) {
  const id = await findId(ctx, table, name);
  if (!id) throw new Error(`${label} not found: ${name}`);
  return id;
}

const findOrCreateProduct = (ctx: Ctx, L: Lookups, name: string, style?: string, abv?: number) =>
  memo(L.product, name, async () =>
    (await findId(ctx, "products", name)) ??
    (await runCommand<{ id: string }>("create_product", { name, style: style || undefined, abv }, ctx)).id);

const findOrCreatePriceList = (ctx: Ctx, L: Lookups, name: string) =>
  memo(L.priceList, name, async () =>
    (await findId(ctx, "price_lists", name)) ??
    (await unwrap(ctx.db.from("price_lists").insert({ brewery_id: ctx.breweryId, name }).select("id").single()))!.id);

// skus are unique per (product_id, name), not per brewery — every brewery has a
// "1/2 bbl keg" under many products — so resolve through the product name too.
const findSku = (ctx: Ctx, L: Lookups, productName: string, skuName: string) =>
  memo(L.sku, `${productName}|${skuName}`, async () => {
    const sku = await unwrap(ctx.db.from("skus").select("id, products!inner(name)")
      .eq("brewery_id", ctx.breweryId).eq("name", skuName).eq("products.name", productName).maybeSingle());
    if (!sku) throw new Error(`sku not found: ${productName} — ${skuName}`);
    return sku.id as string;
  });

const findLocation = (ctx: Ctx, L: Lookups, name: string) => memo(L.location, name, () => requireId(ctx, "locations", name, "location"));
const findCustomer = (ctx: Ctx, L: Lookups, name: string) => memo(L.customer, name, () => requireId(ctx, "customers", name, "customer"));

// --- per-kind row inserters ---------------------------------------------------

const importers: Record<string, (ctx: Ctx, L: Lookups, r: Row) => Promise<void>> = {
  customers: async (ctx, _L, r) => {
    await unwrap(ctx.db.from("customers").insert({
      brewery_id: ctx.breweryId,
      name: requireField(r, "name"),
      state: requireField(r, "state"),
      type: r.type?.trim() || undefined,
      license_no: r.license_no?.trim() || null,
      payment_terms: r.payment_terms?.trim() || undefined,
    }));
  },

  ship_tos: async (ctx, L, r) => {
    const customer_id = await findCustomer(ctx, L, requireField(r, "customer_name"));
    await unwrap(ctx.db.from("ship_tos").insert({
      brewery_id: ctx.breweryId, customer_id,
      label: requireField(r, "label"), address1: requireField(r, "address1"),
      city: requireField(r, "city"), state: requireField(r, "state"), zip: requireField(r, "zip"),
    }));
  },

  products_skus: async (ctx, L, r) => {
    const name = requireField(r, "sku_name");
    const packageType = requireField(r, "package_type");
    const bblPerUnit = numericString(r, "bbl_per_unit");
    const unitsPerCase = optionalNumber(r, "units_per_case");
    const productId = await findOrCreateProduct(ctx, L, requireField(r, "product"), r.style?.trim(), optionalNumber(r, "abv"));
    await runCommand("create_sku", { productId, name, packageType, unitsPerCase, bblPerUnit }, ctx);
  },

  price_list_items: async (ctx, L, r) => {
    const unit_price_cents = integerField(r, "unit_price_cents");
    const [sku_id, price_list_id] = await Promise.all([
      findSku(ctx, L, requireField(r, "product"), requireField(r, "sku_name")),
      findOrCreatePriceList(ctx, L, requireField(r, "price_list")),
    ]);
    await unwrap(ctx.db.from("price_list_items").insert({ brewery_id: ctx.breweryId, price_list_id, sku_id, unit_price_cents }));
  },

  opening_balances: async (ctx, L, r) => {
    const qty = numberField(r, "qty");
    if (qty === 0) throw new Error(`invalid value for qty: "0" (qty cannot be 0)`);
    const [skuId, locationId] = await Promise.all([
      findSku(ctx, L, requireField(r, "product"), requireField(r, "sku_name")),
      findLocation(ctx, L, requireField(r, "location")),
    ]);
    await insertMovement(ctx, { skuId, locationId, qty, type: "opening_balance" });
  },
};

defineCommand({
  name: "import_csv",
  description: "Bulk-import customers, ship-tos, catalog, price lists, or opening balances from CSV rows",
  input: z.object({
    kind: z.enum(["customers", "ship_tos", "products_skus", "price_list_items", "opening_balances"]),
    rows: z.array(z.record(z.string(), z.string())).max(IMPORT_ROW_CAP, `at most ${IMPORT_ROW_CAP} rows per import batch`),
  }),
  roles: ["admin"],
  handler: (ctx, i) => {
    const importer = importers[i.kind];
    if (!importer) throw new CommandError("unknown import kind");
    const lookups = newLookups();
    return runRowImport(i.rows, (r) => importer(ctx, lookups, r));
  },
});
