// tests/helpers.ts — creates tenants/users via admin credentials; returns RLS-bound clients per user.
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

export async function makeStaff(breweryId: string, role: "admin" | "sales" | "warehouse" | "brewer" = "admin") {
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
export async function makeStaffCtx(breweryId: string, role: "admin" | "sales" | "warehouse" | "brewer" = "admin") {
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
export function sql(q: string, quiet = false): string[] {
  const args = quiet ? [DB, "-Atq", "-c", q] : [DB, "-Atc", q];
  return execFileSync("psql", args, { encoding: "utf8" }).trim().split("\n").filter(Boolean);
}

// Seed helpers: the one place tests create catalog/location/customer rows, so
// a schema change (Program 3 renames products→brands+formats) is one edit.
export async function seedCatalog(
  breweryId: string,
  opts: { product?: string; sku?: string; packageType?: "keg" | "can" | "bottle"; bblPerUnit?: number } = {},
) {
  const { data: p, error: pe } = await admin.from("products")
    .insert({ brewery_id: breweryId, name: opts.product ?? "IPA" }).select("id").single();
  if (pe) throw pe;
  const { data: s, error: se } = await admin.from("skus").insert({
    brewery_id: breweryId, product_id: p.id, name: opts.sku ?? "IPA case",
    package_type: opts.packageType ?? "can", bbl_per_unit: opts.bblPerUnit ?? 0.0645,
  }).select("id").single();
  if (se) throw se;
  return { productId: p.id as string, skuId: s.id as string };
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

// A customer with one ship-to and a price list (created empty unless given).
export async function seedCustomer(
  breweryId: string,
  opts: { name?: string; state?: string; priceListId?: string } = {},
) {
  let priceListId = opts.priceListId;
  if (!priceListId) {
    const { data, error } = await admin.from("price_lists")
      .insert({ brewery_id: breweryId, name: "std" }).select("id").single();
    if (error) throw error;
    priceListId = data.id as string;
  }
  const state = opts.state ?? "PA";
  const { data: c, error: ce } = await admin.from("customers").insert({
    brewery_id: breweryId, name: opts.name ?? "Bar", type: "retailer", state, price_list_id: priceListId,
  }).select("id").single();
  if (ce) throw ce;
  const { data: st, error: se } = await admin.from("ship_tos").insert({
    brewery_id: breweryId, customer_id: c.id, label: "main", address1: "1 Main St", city: "Town", state, zip: "19100",
  }).select("id").single();
  if (se) throw se;
  return { customerId: c.id as string, shipToId: st.id as string, priceListId };
}
