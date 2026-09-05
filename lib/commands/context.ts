// lib/commands/context.ts — resolves a command caller's verified identity and brewery membership.
import { cache } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  createRequestAuthContext,
  getRequestAuthContext,
  type RequestAuthContext,
} from "@/lib/auth/request-context";
import { z } from "zod";
import { publicEnv } from "@/lib/env/public";
import { CommandError, unwrap } from "./registry";
import type { Ctx } from "./registry";

// Exported for tests; production callers go through buildContextFromBearer.
// Both membership reads go through unwrap so a database failure is a 500
// db_error rather than being mistaken for "not a member" (403). A malformed
// breweryId is rejected up front so Postgres never sees it (a 22P02 would
// otherwise surface as db_error) and the caller still gets not_member.
export async function ctxForBearer(db: SupabaseClient, userId: string, breweryId: string): Promise<Ctx> {
  if (!z.uuid().safeParse(breweryId).success) {
    throw new CommandError("not a member of this brewery", 403, "not_member");
  }
  const staff = await unwrap(db
    .from("brewery_users")
    .select("role")
    .eq("brewery_id", breweryId)
    .eq("user_id", userId)
    .maybeSingle());
  if (staff) return { db, userId, breweryId, role: staff.role };

  const customer = await unwrap(db
    .from("customer_users")
    .select("customer_id, customers!inner(brewery_id)")
    .eq("user_id", userId)
    .eq("customers.brewery_id", breweryId)
    .limit(1));
  if (customer?.length) {
    return { db, userId, breweryId, role: "customer", customerId: customer[0].customer_id };
  }

  throw new CommandError("not a member of this brewery", 403, "not_member");
}

async function buildCookieContext(breweryId: string, request: RequestAuthContext): Promise<Ctx> {
  const identity = await request.getIdentity();
  if (!identity) throw new CommandError("unauthenticated", 401, "unauthenticated");

  const db = await request.getSupabaseClient();
  const staff = await request.getStaffMembership(breweryId);
  if (staff) return { db, userId: identity.userId, breweryId, role: staff.role };

  const customer = await request.getCustomerMembership(breweryId);
  if (customer) {
    return {
      db,
      userId: identity.userId,
      breweryId,
      role: "customer",
      customerId: customer.customerId,
    };
  }

  throw new CommandError("not a member of this brewery", 403, "not_member");
}

// Server Components share React's request cache through the RSC composition.
export const buildContext = cache(async (breweryId: string): Promise<Ctx> =>
  buildCookieContext(breweryId, getRequestAuthContext())
);

// Route handlers have no React Server Component cache, so compose explicitly.
export async function buildRouteContext(breweryId: string): Promise<Ctx> {
  return buildCookieContext(breweryId, createRequestAuthContext());
}

// API clients supply a bearer token. Its validation and RLS-bound client are
// intentionally explicit rather than sharing cookie-scoped request state.
export async function buildContextFromBearer(breweryId: string, accessToken: string): Promise<Ctx> {
  if (!accessToken) throw new CommandError("unauthenticated", 401, "unauthenticated");

  const verifier = createClient(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await verifier.auth.getClaims(accessToken);
  const userId = data?.claims.sub;
  if (error || typeof userId !== "string") {
    throw new CommandError("unauthenticated", 401, "unauthenticated");
  }

  const db = createClient(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    accessToken: async () => accessToken,
  });
  return ctxForBearer(db, userId, breweryId);
}
