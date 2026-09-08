// The CSV map and its preview/command validation use the same field contract.
import { z } from "zod";
export const IMPORT_ROW_CAP = 5000;
export const IMPORT_KINDS = ["customers", "ship_tos", "products_skus", "channel_prices", "opening_balances"] as const;
export type ImportKind = typeof IMPORT_KINDS[number];
type Field = { name: string; required?: boolean; type?: "uuid" | "positive" | "cents" | "number" | "state"; lookup?: string; values?: readonly string[] };
export const IMPORT_FIELDS: Record<ImportKind, Field[]> = {
  customers: [{ name: "name", required: true }, { name: "type", required: true, values: ["distributor", "retailer", "brewery", "other"] }, { name: "state", required: true, type: "state" }, { name: "saleChannelId", required: true, type: "uuid", lookup: "channels" }, { name: "licenseNumber" }, { name: "paymentTerms" }],
  ship_tos: [{ name: "customerId", required: true, type: "uuid", lookup: "customers" }, ...["label", "address1", "city", "zip"].map(name => ({ name, required: true })), { name: "state", required: true, type: "state" }, { name: "address2" }],
  products_skus: [{ name: "product", required: true }, { name: "formatId", required: true, type: "uuid", lookup: "formats" }, { name: "sku_name" }, { name: "style" }, { name: "abv", type: "number" }, { name: "upc" }],
  channel_prices: [{ name: "saleChannelId", required: true, type: "uuid", lookup: "channels" }, { name: "priceGroupId", required: true, type: "uuid", lookup: "groups" }, { name: "formatId", required: true, type: "uuid", lookup: "formats" }, { name: "unitPriceCents", required: true, type: "cents" }],
  opening_balances: [{ name: "skuId", required: true, type: "uuid", lookup: "skus" }, { name: "locationId", required: true, type: "uuid", lookup: "locations" }, { name: "binId", required: true, type: "uuid", lookup: "bins" }, { name: "qty", required: true, type: "positive" }, { name: "note" }],
};
export type ImportLookups = Record<string, { id: string; name: string; location_id?: string }[]>;
export type ImportOutcome = { row: number; status: "committed" | "blocked"; result?: { id?: string }; error?: string };
export type ImportResult = { committed: number; blocked: number; outcomes: ImportOutcome[] };

export function validateImportRow(kind: ImportKind, row: Record<string, string>, lookups?: ImportLookups): string[] {
  const errors: string[] = Object.keys(row).filter(key => !IMPORT_FIELDS[kind].some(f => f.name === key)).map(key => `unknown CSV field ${key}`);
  for (const f of IMPORT_FIELDS[kind]) {
    const value = row[f.name]?.trim() ?? "";
    if (!value) { if (f.required) errors.push(`${f.name} is required`); continue; }
    if (f.values && !f.values.includes(value)) errors.push(`${f.name}: choose ${f.values.join(", ")}`);
    if (f.type === "uuid" && !z.uuid().safeParse(value).success) errors.push(`${f.name} must be a UUID`);
    if (f.type === "state" && !/^[A-Z]{2}$/.test(value)) errors.push(`${f.name} must be two uppercase letters`);
    if (["number", "positive", "cents"].includes(f.type ?? "")) {
      if (!/^[+-]?[0-9]+(\.[0-9]+)?$/.test(value) || !Number.isFinite(Number(value)) || (f.type === "positive" && Number(value) <= 0) || (f.type === "cents" && (!/^[0-9]+$/.test(value) || Number(value) > 2147483647))) errors.push(`${f.name} must be ${f.type === "positive" ? "a positive decimal" : f.type === "cents" ? "whole cents (0–2147483647)" : "a decimal"}`);
    }
    if (f.lookup && lookups && !lookups[f.lookup]?.some(item => item.id === value)) errors.push(`${f.name} was not found`);
  }
  if (kind === "opening_balances" && lookups && !lookups.bins?.some(b => b.id === row.binId?.trim() && b.location_id === row.locationId?.trim())) errors.push("binId must belong to locationId");
  return errors;
}

export function mapCsvRows(rows: string[][], mapping: Record<string, number>): Record<string, string>[] {
  return rows.map(row => Object.fromEntries(Object.entries(mapping).filter(([, index]) => index >= 0).map(([field, index]) => [field, row[index] ?? ""])));
}

export function parseCsv(input: string): { headers: string[]; rows: string[][] } {
  const text = input.replace(/^\uFEFF/, "");
  const records: string[][] = []; let row: string[] = [], value = "", quoted = false, closed = false;
  const field = () => { row.push(value); value = ""; closed = false; };
  const record = () => { field(); records.push(row); row = []; if (records.length > IMPORT_ROW_CAP + 1) throw new Error(`At most ${IMPORT_ROW_CAP} rows per batch`); };
  for (let n = 0; n < text.length; n++) {
    const c = text[n];
    if (quoted) {
      if (c === '"') { if (text[n + 1] === '"') { value += '"'; n++; } else { quoted = false; closed = true; } }
      else value += c;
    } else if (c === ',') field();
    else if (c === '\r' || c === '\n') { if (c === '\r' && text[n + 1] === '\n') n++; record(); }
    else if (c === '"' && !value && !closed) quoted = true;
    else { if (closed || c === '"') throw new Error("Malformed CSV quoting"); value += c; }
  }
  if (quoted) throw new Error("Unclosed CSV quote");
  if (value || closed || row.length) record();
  const headers = records.shift()?.map(h => h.trim()) ?? [];
  if (!headers.length || headers.some(h => !h) || new Set(headers).size !== headers.length) throw new Error("CSV needs unique, nonempty column headers");
  if (!records.length) throw new Error("CSV has no data rows");
  if (records.some(r => r.length !== headers.length)) throw new Error("CSV rows must match the header column count");
  return { headers, rows: records };
}
