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
import type { Ctx, PreTenantCtx, OperationCtx } from "./registry";
import type { CommandContextExpectation } from "./registry";

const uuid = z.uuid();
/** True for a canonical UUID string; shared by the command route and the bearer context. */
export const isUuid = (value: string | undefined): value is string => value !== undefined && uuid.safeParse(value).success;

// Exported for tests; production callers go through buildContextFromBearer.
// Both membership reads go through unwrap so a database failure is a 500
// db_error rather than being mistaken for "not a member" (403). A malformed
// breweryId is rejected up front (Postgres would raise 22P02 → db_error) and
// still reads as not_member, the contract tests/api-command.test.ts pins.
export async function ctxForBearer(db: SupabaseClient, userId: string, breweryId: string): Promise<Ctx> {
  if (!isUuid(breweryId)) {
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

const contextChanged = () => new CommandError("Signed-in account or active workspace changed. Return to the original context to retry this unchanged action.", 409, "context_changed");

function assertExpectedContext(ctx: OperationCtx, expected?: CommandContextExpectation) {
  if (!expected) return;
  if (expected.actorId !== ctx.userId
    || expected.breweryId !== (ctx.breweryId ?? undefined)
    || expected.customerId !== (ctx.role === "customer" ? ctx.customerId : undefined)) throw contextChanged();
}

function scopeHeaders(ctx: OperationCtx): Record<string, string> {
  return {
    "x-mgr-actor-id": ctx.userId,
    ...(ctx.breweryId ? { "x-mgr-brewery-id": ctx.breweryId } : {}),
    ...(ctx.role === "customer" && ctx.customerId ? { "x-mgr-customer-id": ctx.customerId } : {}),
  };
}

async function buildCookieContext(breweryId: string | undefined, request: RequestAuthContext, expected?: CommandContextExpectation): Promise<OperationCtx> {
  const identity = await request.getIdentity();
  if (!identity) throw new CommandError("unauthenticated", 401, "unauthenticated");

  const discoveryDb = await request.getSupabaseClient();
  if (breweryId === undefined) {
    const discovered = { db: discoveryDb, userId: identity.userId, breweryId: null, role: null } satisfies PreTenantCtx;
    assertExpectedContext(discovered, expected);
    return { ...discovered, db: await request.getScopedSupabaseClient(scopeHeaders(discovered)) };
  }
  const staff = await request.getStaffMembership(breweryId);
  if (staff) {
    const discovered = { db: discoveryDb, userId: identity.userId, breweryId, role: staff.role } satisfies Ctx;
    assertExpectedContext(discovered, expected);
    return { ...discovered, db: await request.getScopedSupabaseClient(scopeHeaders(discovered)) };
  }

  const customer = await request.getCustomerMembership(breweryId);
  if (customer) {
    const discovered = {
      db: discoveryDb,
      userId: identity.userId,
      breweryId,
      role: "customer",
      customerId: customer.customerId,
    } satisfies Ctx;
    assertExpectedContext(discovered, expected);
    return { ...discovered, db: await request.getScopedSupabaseClient(scopeHeaders(discovered)) };
  }

  throw new CommandError("not a member of this brewery", 403, "not_member");
}

// Server Components share React's request cache through the RSC composition.
function cookieContext(breweryId: string): Promise<Ctx>;
function cookieContext(breweryId?: undefined): Promise<PreTenantCtx>;
function cookieContext(breweryId?: string): Promise<OperationCtx> {
  return buildCookieContext(breweryId, getRequestAuthContext());
}
export const buildContext = cache(cookieContext);

// Route handlers have no React Server Component cache, so compose explicitly.
export async function buildRouteContext(breweryId?: string, expected?: CommandContextExpectation): Promise<OperationCtx> {
  return buildCookieContext(breweryId, createRequestAuthContext(), expected);
}

// API clients supply a bearer token. Its validation and RLS-bound client are
// intentionally explicit rather than sharing cookie-scoped request state.
export async function buildContextFromBearer(breweryId: string | undefined, accessToken: string, expected?: CommandContextExpectation): Promise<OperationCtx> {
  if (!accessToken) throw new CommandError("unauthenticated", 401, "unauthenticated");

  const verifier = createClient(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await verifier.auth.getClaims(accessToken);
  const userId = data?.claims.sub;
  if (error || typeof userId !== "string") {
    throw new CommandError("unauthenticated", 401, "unauthenticated");
  }

  const discoveryDb = createClient(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    accessToken: async () => accessToken,
  });
  const discovered = breweryId === undefined
    ? ({ db: discoveryDb, userId, breweryId: null, role: null } satisfies PreTenantCtx)
    : await ctxForBearer(discoveryDb, userId, breweryId);
  assertExpectedContext(discovered, expected);
  const db = createClient(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    accessToken: async () => accessToken,
    global: { headers: scopeHeaders(discovered) },
  });
  return { ...discovered, db };
}
