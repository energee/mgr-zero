// lib/commands/import.ts — bulk CSV import for customers, ship-tos, catalog,
// price lists, and opening balances. One command (`import_csv`) dispatches by
// `kind` to a per-row inserter; referenced entities are resolved by name
// within ctx.breweryId, creating catalog/price-list parents on the fly.
// Per-row failures are collected into `errors` rather than thrown, so a bad
// row never aborts the good ones in the same batch.
// atomic-exempt: rows are independent by design and re-import is idempotent
// by name; a customer row's customer+ship_to pair is the one non-atomic pair.
import { createHash } from "node:crypto";
import { z } from "zod";
import { defineCommand, runCommand, unwrap, CommandError, Ctx, CommandExecution } from "./registry";
import { insertMovement } from "./inventory";
import { IMPORT_ROW_CAP } from "./import-limits";

type Row = Record<string, string>;
type ImportResult = { inserted: number; errors: { row: number; message: string }[] };

// Runs `fn` once per row, collecting failures instead of aborting the batch.
async function runRowImport(rows: Row[], fn: (r: Row, row: number) => Promise<void>): Promise<ImportResult> {
  const errors: ImportResult["errors"] = [];
  let inserted = 0;
  for (let row = 0; row < rows.length; row++) {
    try {
      await fn(rows[row], row);
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

// Deterministic row-local request IDs keep every temporary import child replayable
// until Task 13 replaces this in-memory loop with a durable import workflow.
function importExecution(execution: CommandExecution, row: number, operation: number): CommandExecution {
  const digest = createHash("sha256")
    .update(`${execution.requestId}:${row}:${operation}`)
    .digest("hex");
  const variant = ((Number.parseInt(digest[16], 16) & 0x3) | 0x8).toString(16);
  const requestId = [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `8${digest.slice(13, 16)}`,
    `${variant}${digest.slice(17, 20)}`,
    digest.slice(20, 32),
  ].join("-");
  return { requestId, correlationId: execution.correlationId };
}

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

const findOrCreateProduct = (ctx: Ctx, L: Lookups, name: string, execution: CommandExecution, style?: string, abv?: number) =>
  memo(L.product, name, async () =>
    (await findId(ctx, "products", name)) ??
    ((await runCommand("create_product", { name, style: style || undefined, abv }, ctx, execution) as { id: string }).id));

const findOrCreatePriceList = (ctx: Ctx, L: Lookups, name: string, execution: CommandExecution) =>
  memo(L.priceList, name, async () =>
    (await findId(ctx, "price_lists", name)) ??
    ((await runCommand("upsert_price_list", { name }, ctx, execution) as { id: string }).id));

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

const importers: Record<string, (ctx: Ctx, lookups: Lookups, row: Row, index: number, execution: CommandExecution) => Promise<void>> = {
  customers: async (ctx, _lookups, row, index, execution) => {
    await runCommand("upsert_customer", {
      name: requireField(row, "name"), state: requireField(row, "state"),
      type: row.type?.trim() || "retailer", licenseNumber: row.license_no?.trim() || undefined,
      paymentTerms: row.payment_terms?.trim() || undefined,
    }, ctx, importExecution(execution, index, 1));
  },
  ship_tos: async (ctx, lookups, row, index, execution) => {
    const customerId = await findCustomer(ctx, lookups, requireField(row, "customer_name"));
    await runCommand("upsert_ship_to", {
      customerId, label: requireField(row, "label"), address1: requireField(row, "address1"),
      city: requireField(row, "city"), state: requireField(row, "state"), zip: requireField(row, "zip"),
    }, ctx, importExecution(execution, index, 2));
  },
  products_skus: async (ctx, lookups, row, index, execution) => {
    const productId = await findOrCreateProduct(ctx, lookups, requireField(row, "product"), importExecution(execution, index, 3), row.style?.trim(), optionalNumber(row, "abv"));
    await runCommand("create_sku", {
      productId, name: requireField(row, "sku_name"), packageType: requireField(row, "package_type"),
      unitsPerCase: optionalNumber(row, "units_per_case"), bblPerUnit: numericString(row, "bbl_per_unit"),
    }, ctx, importExecution(execution, index, 4));
  },
  price_list_items: async (ctx, lookups, row, index, execution) => {
    const [skuId, priceListId] = await Promise.all([
      findSku(ctx, lookups, requireField(row, "product"), requireField(row, "sku_name")),
      findOrCreatePriceList(ctx, lookups, requireField(row, "price_list"), importExecution(execution, index, 5)),
    ]);
    await runCommand("set_price", { priceListId, skuId, unitPriceCents: integerField(row, "unit_price_cents") }, ctx, importExecution(execution, index, 6));
  },
  opening_balances: async (ctx, lookups, row, index, execution) => {
    const qty = numberField(row, "qty");
    if (qty === 0) throw new Error(`invalid value for qty: "0" (qty cannot be 0)`);
    const [skuId, locationId] = await Promise.all([
      findSku(ctx, lookups, requireField(row, "product"), requireField(row, "sku_name")),
      findLocation(ctx, lookups, requireField(row, "location")),
    ]);
    await insertMovement(ctx, { skuId, locationId, qty, type: "opening_balance" }, importExecution(execution, index, 7));
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
  handler: (ctx, input, execution) => {
    const importer = importers[input.kind];
    if (!importer) throw new CommandError("unknown import kind");
    const lookups = newLookups();
    return runRowImport(input.rows, (row, index) => importer(ctx, lookups, row, index, execution));
  },
});
