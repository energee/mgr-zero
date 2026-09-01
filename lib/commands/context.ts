// lib/commands/context.ts — resolves the caller's membership into a Ctx. Throws if not a member.
// Wrapped in React.cache so a layout, a page and its queries within one request
// share a single membership lookup instead of each re-running it.
import { cache } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import { CommandError } from "./registry";
import type { Ctx } from "./registry";

async function ctxFor(db: SupabaseClient, userId: string, breweryId: string): Promise<Ctx> {
  const { data: staff } = await db.from("brewery_users").select("role").eq("brewery_id", breweryId).eq("user_id", userId).maybeSingle();
  if (staff) return { db, userId, breweryId, role: staff.role };
  const { data: cust } = await db
    .from("customer_users")
    .select("customer_id, customers!inner(brewery_id)")
    .eq("user_id", userId)
    .eq("customers.brewery_id", breweryId)
    .limit(1);
  if (cust?.length) return { db, userId: user.id, breweryId, role: "customer", customerId: cust[0].customer_id };
  throw new CommandError("not a member of this brewery", 403);
}

export const buildContext = cache(async (breweryId: string): Promise<Ctx> => {
  const db = await createServerClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new CommandError("unauthenticated", 401);
  return ctxFor(db, user.id, breweryId);
});

// API clients send a Supabase access token; Auth validates it (revoked/expired
// fail), then the same membership lookup runs under that JWT so RLS still binds.
export async function buildContextFromBearer(breweryId: string, accessToken: string): Promise<Ctx> {
  if (!accessToken) throw new CommandError("unauthenticated", 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const { data: { user }, error } = await createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } }).auth.getUser(accessToken);
  if (error || !user) throw new CommandError("unauthenticated", 401);
  const db = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    accessToken: async () => accessToken,
  });
  return ctxFor(db, user.id, breweryId);
}
