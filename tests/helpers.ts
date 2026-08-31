// tests/helpers.ts — creates tenants/users via admin client; returns RLS-bound clients per user.
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54341";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

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

export async function makeStaff(breweryId: string, role: "admin" | "sales" | "warehouse" = "admin") {
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
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: "test-password-1" });
  if (error) throw error;
  return c;
}

// A ready-to-use command Ctx for a fresh staff member of `breweryId`.
export async function makeStaffCtx(breweryId: string, role: "admin" | "sales" | "warehouse" = "admin") {
  const staff = await makeStaff(breweryId, role);
  const db = await asUser(staff.email);
  return { db, userId: staff.id, breweryId, role };
}
