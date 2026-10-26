// The CSV map and its preview/command validation use the same field contract.
import { z } from "zod";
import { COUNTRY_CODES, CUSTOMER_TYPES, PAYMENT_TERMS, US_STATE_CODES } from "@/lib/mgr/enums";
export const IMPORT_ROW_CAP = 5000;
/** The row cap as operators read it ("5,000"), in the upload help and the over-cap error. */
export const IMPORT_ROW_CAP_LABEL = IMPORT_ROW_CAP.toLocaleString("en-US");
export const IMPORT_KINDS = ["customers", "ship_tos", "products_skus", "channel_prices", "opening_balances"] as const;
export type ImportKind = typeof IMPORT_KINDS[number];

/** Display labels only; CSV headers and command payloads keep their stable keys. */
export const IMPORT_FIELD_LABELS = {
  name: "Name", type: "Customer type", state: "State", saleChannelId: "Sale channel",
  licenseNumber: "License number", paymentTerms: "Payment terms", country: "Country", alias: "Alias",
  customerId: "Customer", label: "Address label", address1: "Address line 1", address2: "Address line 2",
  city: "City", zip: "ZIP / postal code", product: "Brand", formatId: "Format", sku_name: "SKU name",
  style: "Style", abv: "ABV (%)", upc: "UPC", priceGroupId: "Price group", unitPriceCents: "Unit price (cents)",
  skuId: "SKU", locationId: "Location", binId: "Bin", qty: "Quantity", note: "Note",
};
// usOnly: required only when the row's country is US (the default), as in
// import_csv_row. A state outside the US is refused (customers_state_by_country).
type Field = { name: keyof typeof IMPORT_FIELD_LABELS; required?: boolean; usOnly?: boolean; type?: "positive" | "cents" | "number" | "state" | "country"; lookup?: string; values?: readonly string[] };
export const IMPORT_FIELDS: Record<ImportKind, Field[]> = {
  customers: [{ name: "name", required: true }, { name: "type", required: true, values: CUSTOMER_TYPES }, { name: "state", usOnly: true, type: "state" }, { name: "saleChannelId", required: true, lookup: "channels" }, { name: "licenseNumber" }, { name: "paymentTerms", values: PAYMENT_TERMS }, { name: "country", type: "country" }, { name: "alias" }],
  ship_tos: [{ name: "customerId", required: true, lookup: "customers" }, { name: "label", required: true }, { name: "address1" }, { name: "city" }, { name: "zip" }, { name: "state", usOnly: true, type: "state" }, { name: "address2" }, { name: "country", type: "country" }],
  products_skus: [{ name: "product", required: true }, { name: "formatId", required: true, lookup: "formats" }, { name: "sku_name" }, { name: "style" }, { name: "abv", type: "number" }, { name: "upc" }],
  channel_prices: [{ name: "saleChannelId", required: true, lookup: "channels" }, { name: "priceGroupId", required: true, lookup: "groups" }, { name: "formatId", required: true, lookup: "formats" }, { name: "unitPriceCents", required: true, type: "cents" }],
  opening_balances: [{ name: "skuId", required: true, lookup: "skus" }, { name: "locationId", required: true, lookup: "locations" }, { name: "binId", required: true, lookup: "bins" }, { name: "qty", required: true, type: "positive" }, { name: "note" }],
};
const IMPORT_TEMPLATE_NAMES: Record<ImportKind, string> = {
  customers: "customers-template.csv", ship_tos: "ship-tos-template.csv",
  products_skus: "products-and-skus-template.csv", channel_prices: "channel-prices-template.csv",
  opening_balances: "opening-balances-template.csv",
};
export const importTemplateName = (kind: ImportKind) => IMPORT_TEMPLATE_NAMES[kind];

// Every example leaves a mandatory cell empty, so it cannot import even when
// reference names happen to exist. No example contains a real record ID.
const IMPORT_TEMPLATE_EXAMPLES: Record<ImportKind, Record<string, string>> = {
  customers: { name: "EXAMPLE ONLY - replace this row", state: "PA", saleChannelId: "Your sale channel", paymentTerms: "net30", country: "US" },
  ship_tos: { label: "EXAMPLE ONLY - replace this row", address1: "123 Example Street", city: "Example City", zip: "00000", state: "PA", country: "US" },
  products_skus: { product: "EXAMPLE ONLY - replace this row", sku_name: "Example lager half keg", style: "Lager", abv: "5.2" },
  channel_prices: { priceGroupId: "Your price group", formatId: "Your format", unitPriceCents: "12500" },
  opening_balances: { locationId: "Your location", binId: "Your bin", qty: "10", note: "EXAMPLE ONLY - replace this row" },
};
/** Stable header keys followed by one intentionally incomplete example row. */
export function importTemplateCsv(kind: ImportKind): string {
  const fields = IMPORT_FIELDS[kind], example = IMPORT_TEMPLATE_EXAMPLES[kind];
  return `${fields.map(field => field.name).join(",")}\r\n${fields.map(field => example[field.name] ?? "").join(",")}\r\n`;
}

/** State is mandatory only when at least one row uses a US address. */
export function canReviewImport(kind: ImportKind, mapping: Record<string, number>, headers: string[], rows: Record<string, string>[]): boolean {
  const hasUsAddress = rows.some(row => (row.country?.trim() || "US") === "US");
  return rows.length > 0 && IMPORT_FIELDS[kind].every(field => {
    if (!field.required && !(field.usOnly && hasUsAddress)) return true;
    const column = mapping[field.name];
    return Number.isInteger(column) && column >= 0 && column < headers.length;
  });
}
/** The channel_prices reference columns; together they name one price cell. */
export const PRICE_REFERENCE_FIELDS = IMPORT_FIELDS.channel_prices.filter(f => f.lookup).map(f => f.name);
export type ImportLookups = Record<string, { id: string; name: string; location_id?: string; basis?: string; price_group_id?: string | null }[]>;
export type ImportOutcome = { row: number; status: "committed" | "blocked"; result?: { id?: string }; error?: string };
export type ImportResult = { committed: number; blocked: number; outcomes: ImportOutcome[] };

/** Rows that can collide on a unique key share an import key, so import_csv runs
 *  them in file order (the first of two same-name customers wins); rows with
 *  different keys run concurrently. Coarse is safe: a shared key only serializes.
 *  The collisions per kind, from the schema:
 *  - customers: unique (brewery_id, name)
 *  - products_skus: the brand-name advisory lock (the first row creating a brand
 *    sets its style and ABV) and unique (brand_id, format_id); unique (brewery_id, upc)
 *    spans products, so import_csv runs a whole file in order once any row has a UPC
 *  - channel_prices: primary key (sale_channel_id, price_group_id, format_id); last write wins
 *  Ship-tos are never imported as default and opening balances only append, so
 *  those rows cannot collide and get a key of their own. A price reference written
 *  once by name and once by UUID has different keys, so import_csv serializes a
 *  file whose price reference column mixes names and UUIDs. */
export function importRowKey(kind: ImportKind, row: Record<string, string>, index: number): string {
  // UUIDs are case-insensitive in SQL; lower-case them so one cell has one key.
  const v = (f: string) => (row[f]?.trim() ?? "").toLowerCase();
  switch (kind) {
    case "customers": return `name:${row.name?.trim() ?? ""}`;
    case "products_skus": return `product:${row.product?.trim() ?? ""}`;
    case "channel_prices": return PRICE_REFERENCE_FIELDS.map(v).join(":");
    case "ship_tos": case "opening_balances": return `row:${index}`;
  }
}

// The opening qty: record_inventory_movement refuses qty <> round(qty, 2), the same
// rule the order commands state as multipleOf(0.01), so trailing zeros pass and a
// third significant decimal does not.
const openingQty = z.number().positive().multipleOf(0.01);

/** True when a reference cell is an id rather than a name. Matches private.import_ref:
 * any 8-4-4-4-12 hex string, not only the RFC-variant UUIDs z.uuid() accepts. */
export const isImportUuid = (value?: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value?.trim() ?? "");

/** Reference cells keep their raw UUID/name for durable replay. With lookup data,
 * preview requires one trimmed, case-insensitive exact match; the RPC resolves
 * references authoritatively when lookup data is absent. */
export function validateImportRow(kind: ImportKind, row: Record<string, string>, lookups?: ImportLookups): string[] {
  const errors: string[] = Object.keys(row).filter(key => !IMPORT_FIELDS[kind].some(f => f.name === key)).map(key => `unknown CSV field ${key}`);
  const references: Record<string, ImportLookups[string][number]> = {};
  const us = (row.country?.trim() || "US") === "US";
  for (const f of IMPORT_FIELDS[kind]) {
    const value = row[f.name]?.trim() ?? "", label = IMPORT_FIELD_LABELS[f.name];
    if (!value) { if (f.required || (f.usOnly && us)) errors.push(`${label} is required`); continue; }
    if (f.name === "state" && !us) { errors.push("State is for a US address only; leave it blank for another country"); continue; }
    if (f.values && !f.values.includes(value)) errors.push(`${label}: choose ${f.values.join(", ")}`);
    // Preview resolves identities only for validation; the RPC receives the original cells.
    if (f.lookup && lookups) {
      const uuid = isImportUuid(value);
      let candidates = lookups[f.lookup] ?? [];
      if (f.lookup === "bins" && !uuid) candidates = candidates.filter(item => item.location_id?.toLowerCase() === references.locationId?.id.toLowerCase());
      if (f.lookup === "formats") candidates = candidates.filter(item => item.basis === "packaged" || (kind === "channel_prices" && item.price_group_id === references.priceGroupId?.id));
      const matches = candidates.filter(item => uuid
        ? item.id.toLowerCase() === value.toLowerCase()
        : item.name.trim().toLowerCase() === value.toLowerCase());
      if (!matches.length) errors.push(`${label} was not found`);
      else if (matches.length > 1) errors.push(`${label}: "${value}" matches ${matches.length} records; use the ID`);
      else references[f.name] = matches[0];
    }
    if (f.type === "state" && !(US_STATE_CODES as readonly string[]).includes(value)) errors.push(`${label} must be a US state code, such as PA`);
    if (f.type === "country" && !(COUNTRY_CODES as readonly string[]).includes(value)) errors.push(`${label} must be a two-letter country code, such as JP`);
    if (["number", "positive", "cents"].includes(f.type ?? "")) {
      if (!/^[+-]?[0-9]+(\.[0-9]+)?$/.test(value) || !Number.isFinite(Number(value)) || (f.type === "positive" && !openingQty.safeParse(Number(value)).success) || (f.type === "cents" && (!/^[0-9]+$/.test(value) || Number(value) > 2147483647))) errors.push(`${label} must be ${f.type === "positive" ? "a positive number with at most two decimal places" : f.type === "cents" ? "a whole number from 0 to 2,147,483,647 (100 cents = $1)" : "a decimal"}`);
    }
  }
  if (kind === "opening_balances" && references.binId && references.locationId && references.binId.location_id?.toLowerCase() !== references.locationId.id.toLowerCase()) errors.push("Bin must belong to Location");
  return errors;
}

/** Preview duplicates use the customer's existing server identity, not the coarser
 * serialization keys of other kinds. Only otherwise-ready rows reserve a name. */
export function validateImportRows(kind: ImportKind, rows: Record<string, string>[], lookups?: ImportLookups): string[][] {
  const customers = new Map<string, number>();
  return rows.map((row, index) => {
    const errors = validateImportRow(kind, row, lookups);
    if (kind !== "customers" || errors.length) return errors;
    const key = importRowKey(kind, row, index);
    const first = customers.get(key);
    if (first !== undefined) return [`Duplicate of row ${first + 1}: customer name`];
    customers.set(key, index);
    return errors;
  });
}

/** The rows the preview marked ready (no validation errors) — the only rows a batch sends. */
export function readyImportRows(rows: Record<string, string>[], validation: string[][]): Record<string, string>[] {
  return rows.filter((_, index) => !validation[index]?.length);
}

/** The 1-based preview row number of each ready row, in send order. import_csv numbers
 *  outcomes by position in the sent array, so outcome row n is preview row numbers[n - 1]. */
export function readyImportRowNumbers(validation: string[][]): number[] {
  return validation.flatMap((errors, index) => errors.length ? [] : [index + 1]);
}

export function mapCsvRows(rows: string[][], mapping: Record<string, number>): Record<string, string>[] {
  return rows.map(row => Object.fromEntries(Object.entries(mapping).filter(([, index]) => index >= 0).map(([field, index]) => [field, row[index] ?? ""])));
}

export function parseCsv(input: string): { headers: string[]; rows: string[][] } {
  if (input.includes("\0")) throw new Error("This file is not a CSV. In Excel or Google Sheets, save it as CSV and choose it again.");
  // Excel writes a "sep=," first line; spreadsheets end files with blank lines.
  const text = input.replace(/^\uFEFF/, "").replace(/^sep=,\r?\n/i, "");
  const records: string[][] = []; let row: string[] = [], value = "", quoted = false, closed = false;
  const field = () => { row.push(value); value = ""; closed = false; };
  const record = () => { const blank = !row.length && !value && !closed; field(); if (!blank) records.push(row); row = []; if (records.length > IMPORT_ROW_CAP + 1) throw new Error(`At most ${IMPORT_ROW_CAP_LABEL} rows per batch`); };
  for (let n = 0; n < text.length; n++) {
    const c = text[n];
    if (quoted) {
      if (c === '"') { if (text[n + 1] === '"') { value += '"'; n++; } else { quoted = false; closed = true; } }
      else value += c;
    } else if (c === ',') field();
    else if (c === '\r' || c === '\n') { if (c === '\r' && text[n + 1] === '\n') n++; record(); }
    else if (c === '"' && !value && !closed) quoted = true;
    // A quote inside an unquoted value (16" keg) is literal; only text after a closing quote is malformed.
    else { if (closed) throw new Error("Malformed CSV quoting"); value += c; }
  }
  if (quoted) throw new Error("Unclosed CSV quote");
  if (value || closed || row.length) record();
  if (!records.length) throw new Error("This file is empty. Add a header row and at least one data row.");
  const headers = records.shift()?.map(h => h.trim()) ?? [];
  if (!headers.length || headers.some(h => !h) || new Set(headers).size !== headers.length) throw new Error("CSV needs unique, nonempty column headers");
  if (!records.length) throw new Error("CSV has no data rows");
  if (records.some(r => r.length !== headers.length)) throw new Error("CSV rows must match the header column count");
  return { headers, rows: records };
}
