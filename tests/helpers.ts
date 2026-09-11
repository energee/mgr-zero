// tests/helpers.ts — creates tenants/users via admin credentials; returns RLS-bound clients per user.
import type { StaffRole } from "@/lib/commands/registry";
import { execFileSync } from "node:child_process";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env/public";
import { readServerEnv } from "@/lib/env/server-parser";

const serverEnv = readServerEnv();
export const admin = createClient(serverEnv.supabaseUrl, serverEnv.supabaseSecretKey, {
  auth: { persistSession: false },
});

export async function makeBrewery(name = `b-${crypto.randomUUID().slice(0, 8)}`) {
  const { data, error } = await admin.from("breweries").insert({ name }).select().single();
  if (error) throw error;
  return data;
}

async function makeAuthUser() {
  const email = `${crypto.randomUUID()}@test.local`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "test-password-1", email_confirm: true });
  if (error) throw error;
  return { id: data.user.id, email };
}

export async function makeStaff(breweryId: string, role: StaffRole = "admin") {
  const u = await makeAuthUser();
  const { error } = await admin.from("brewery_users").insert({ brewery_id: breweryId, user_id: u.id, role });
  if (error) throw error;
  return u;
}

export async function makeCustomerUser(customerId: string) {
  const u = await makeAuthUser();
  const { error } = await admin.from("customer_users").insert({ customer_id: customerId, user_id: u.id });
  if (error) throw error;
  return u;
}

export async function asUser(email: string): Promise<SupabaseClient> {
  const c = createClient(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
    auth: { persistSession: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password: "test-password-1" });
  if (error) throw error;
  return c;
}

// A ready-to-use command Ctx for a fresh staff member of `breweryId`.
export async function makeStaffCtx(breweryId: string, role: StaffRole = "admin") {
  const staff = await makeStaff(breweryId, role);
  const db = await asUser(staff.email);
  return { db, userId: staff.id, breweryId, role };
}

// psql against the test database for pg_catalog assertions (schema-* tests):
// present on dev machines via libpq and on ubuntu-latest CI. DATABASE_URL comes
// from .env.test.local (scripts/test-db.sh → the mgr_test stack on 54352);
// the fallback is CI's single fresh stack. `quiet` drops psql's own chatter.
export const TEST_DB_PORT = 54352;
export const DB = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54342/postgres";
export function sql(q: string, quiet = false, errorVerbosity: "default" | "sqlstate" = "default"): string[] {
  const verbosity = errorVerbosity === "sqlstate" ? ["-v", "VERBOSITY=sqlstate"] : [];
  const transaction = /^\s*begin\s*;/i.test(q) ? [] : ["--single-transaction"];
  const args = [DB, ...verbosity, "-v", "ON_ERROR_STOP=1", ...transaction, quiet ? "-Atq" : "-At", "-f", "-"];
  return execFileSync("psql", args, { encoding: "utf8", input: q }).trim().split("\n").filter(Boolean);
}

type PrivilegedFixtureTable = "inventory_movements" | "taproom_counts" | "taproom_count_lines" | "volume_adjustments" | "volume_adjustment_reclassifications" | "qbo_pushes" | "pos_menus" | "pos_menu_lines" | "pos_catalog_ownership";
const privilegedFixtureTables = new Set<PrivilegedFixtureTable>(["inventory_movements", "taproom_counts", "taproom_count_lines", "volume_adjustments", "volume_adjustment_reclassifications", "qbo_pushes", "pos_menus", "pos_menu_lines", "pos_catalog_ownership"]);

/** Insert protected append-only fixture rows through the existing test-database owner. */
export function insertFixture<T = Record<string, unknown>>(table: PrivilegedFixtureTable, input: Record<string, unknown> | Record<string, unknown>[]): T[] {
  if (!privilegedFixtureTables.has(table)) throw new Error("invalid fixture table");
  const rows = Array.isArray(input) ? input : [input];
  if (rows.length === 0) return [];
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  if (columns.length === 0 || columns.some((column) => !/^[a-z][a-z0-9_]*$/.test(column))) throw new Error("invalid fixture columns");
  const identifiers = columns.map((column) => `"${column}"`).join(",");
  const payload = JSON.stringify(rows).replaceAll("'", "''");
  try {
    return sql(`with inserted as (
      insert into public.${table}(${identifiers})
      select ${identifiers} from jsonb_populate_recordset(null::public.${table},'${payload}'::jsonb)
      returning *
    ) select to_jsonb(inserted)::text from inserted`, true, "sqlstate").map((row) => JSON.parse(row) as T);
  } catch (error) {
    const stderr = String((error as { stderr?: string | Buffer }).stderr ?? "");
    const state = stderr.match(/ERROR:\s+([0-9A-Z]{5})/)?.[1];
    if (state) throw new Error(`fixture insert failed with SQLSTATE ${state}`);
    throw error;
  }
}

/** Insert one raw fixture row and return it; protected surfaces use the database owner. */
export async function ins<T = { id: string }>(table: string, row: Record<string, unknown>): Promise<T> {
  if (privilegedFixtureTables.has(table as PrivilegedFixtureTable)) return insertFixture<T>(table as PrivilegedFixtureTable, row)[0];
  const { data, error } = await admin.from(table).insert(row).select().single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data as T;
}

/** A material row (malt, hop, packaging); returns its id. */
export async function seedMaterial(breweryId: string, o: {
  name: string; category: string; uom?: string; extractPotential?: number | null; lotTracked?: boolean;
}) {
  const uom = o.uom ?? "lb";
  return (await ins("materials", {
    brewery_id: breweryId, name: o.name, category: o.category, base_uom: uom, purchase_uom: uom,
    extract_potential: o.extractPotential ?? null, lot_tracked: o.lotTracked ?? false,
  })).id;
}

// Seed helpers: the one place tests create catalog/location/customer rows, so
// a schema change (Program 3 renames products→brands+formats) is one edit.
// brand + packaged format + the sku that is their product (§16.1, §16.2).
export async function seedCatalog(
  breweryId: string,
  opts: { product?: string; sku?: string; packageType?: "keg" | "can" | "bottle"; bblPerUnit?: number; format?: string } = {},
) {
  const { data: b, error: be } = await admin.from("brands")
    .insert({ brewery_id: breweryId, name: opts.product ?? "IPA" }).select("id").single();
  if (be) throw be;
  const formatName = opts.format ?? `${opts.packageType ?? "can"} ${opts.bblPerUnit ?? 0.0645} bbl`;
  const existing = await admin.from("formats").select("id").eq("brewery_id", breweryId).eq("name", formatName).eq("basis", "packaged").maybeSingle();
  const { data: f, error: fe } = existing.data ? { data: existing.data, error: null } : await admin.from("formats").insert({
    brewery_id: breweryId, name: formatName, basis: "packaged",
    package_type: opts.packageType ?? "can", keg_size: opts.packageType === "keg" ? "half_bbl" : null, bbl_per_unit: opts.bblPerUnit ?? 0.0645,
  }).select("id").single();
  if (fe) throw fe;
  const { data: s, error: se } = await admin.from("skus").insert({
    brewery_id: breweryId, brand_id: b.id, format_id: f.id, name: opts.sku ?? "IPA case",
  }).select("id").single();
  if (se) throw se;
  return { brandId: b.id as string, skuId: s.id as string, formatId: f.id as string };
}

// Mirrors create_location: a location is born with Walk-in, Cold and Dry.
// `binId` is the alphabetically first (Cold), the one order stock lands in.
export async function seedLocation(breweryId: string, opts: { name?: string; kind?: "warehouse" | "taproom" | "storage" } = {}) {
  const row = { brewery_id: breweryId, name: opts.name ?? "WH", kind: opts.kind ?? "warehouse" };
  const { data, error } = await admin.from("locations").insert(row).select("id, name, kind").single();
  if (error) throw error;
  const { data: bins, error: be } = await admin.from("bins")
    .insert(["Walk-in", "Cold", "Dry"].map((name) => ({ brewery_id: breweryId, location_id: data.id, name }))).select("id, name");
  if (be) throw be;
  const binId = (bins as { id: string; name: string }[]).sort((a, b) => a.name.localeCompare(b.name))[0].id;
  return { ...(data as { id: string; name: string; kind: string }), binId };
}

// A customer with one ship-to on a sale channel (Wholesale unless given).
export async function seedCustomer(breweryId: string, opts: { name?: string; state?: string; saleChannelId?: string } = {}) {
  const saleChannelId = opts.saleChannelId ?? await channelId(breweryId, "Wholesale");
  const state = opts.state ?? "PA";
  const { data: c, error: ce } = await admin.from("customers").insert({
    brewery_id: breweryId, name: opts.name ?? "Bar", type: "retailer", state, sale_channel_id: saleChannelId,
  }).select("id").single();
  if (ce) throw ce;
  const { data: st, error: se } = await admin.from("ship_tos").insert({
    brewery_id: breweryId, customer_id: c.id, label: "main", address1: "1 Main St", city: "Town", state, zip: "19100",
  }).select("id").single();
  if (se) throw se;
  return { customerId: c.id as string, shipToId: st.id as string, saleChannelId };
}

// One row of the price grid; position defaults to the next free one (unique per brewery).
export async function seedPriceGroup(breweryId: string, name = "1", position?: number) {
  if (position === undefined) {
    const { data: top } = await admin.from("price_groups").select("position").eq("brewery_id", breweryId).order("position", { ascending: false }).limit(1).maybeSingle();
    position = (top?.position ?? 0) + 1;
  }
  const { data, error } = await admin.from("price_groups").insert({ brewery_id: breweryId, name, position }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

// Price every SKU of a brand on one channel and format: put the brand on group "1"
// (created if missing) and fill that cell. Replaces the old set_price seeding.
export async function priceSku(breweryId: string, o: { saleChannelId: string; brandId: string; formatId: string; cents: number }) {
  let group = (await admin.from("price_groups").select("id").eq("brewery_id", breweryId).eq("name", "1").maybeSingle()).data?.id as string | undefined;
  if (!group) group = await seedPriceGroup(breweryId);
  await admin.from("brands").update({ price_group_id: group }).eq("id", o.brandId);
  const { error } = await admin.from("channel_prices").upsert({ brewery_id: breweryId, sale_channel_id: o.saleChannelId, price_group_id: group, format_id: o.formatId, unit_price_cents: o.cents });
  if (error) throw error;
  return group;
}

// A brewery's seeded sale channel by name (Wholesale, Taproom, DTC, Export —
// written by the trigger on breweries insert; see 00001_baseline.sql).
export async function channelId(breweryId: string, name: string): Promise<string> {
  const { data, error } = await admin.from("sale_channels")
    .select("id").eq("brewery_id", breweryId).eq("name", name).single();
  if (error) throw error;
  return data.id as string;
}
