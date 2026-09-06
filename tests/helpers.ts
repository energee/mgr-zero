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

// psql against the local database for pg_catalog assertions (schema-* tests):
// present on dev machines via libpq and on ubuntu-latest CI; DATABASE_URL
// overrides the local Supabase default. `quiet` drops psql's own chatter.
const DB = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54342/postgres";
export function sql(q: string, quiet = false): string[] {
  const args = quiet ? [DB, "-Atq", "-c", q] : [DB, "-Atc", q];
  return execFileSync("psql", args, { encoding: "utf8" }).trim().split("\n").filter(Boolean);
}
