// lib/auth/request-context.ts — request-scoped Supabase identity and membership lookups shared by layouts and commands.
import type { StaffRole } from "@/lib/commands/registry";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";

export interface RequestIdentity {
  userId: string;
  /** From the session claims; the Me sheet prints it. */
  email: string | null;
}

export interface StaffMembership {
  breweryId: string;
  breweryName: string;
  role: StaffRole;
}

export interface CustomerMembership {
  breweryId: string;
  breweryName: string;
  customerId: string;
  customerName: string;
}

type StaffMembershipRow = {
  brewery_id: string;
  role: StaffMembership["role"];
};

type CustomerMembershipRow = {
  customer_id: string;
  customers: { brewery_id: string; name: string };
};

type RequestClientFactory = () => Promise<SupabaseClient>;

export interface RequestAuthContext {
  getSupabaseClient(): Promise<SupabaseClient>;
  getIdentity(): Promise<RequestIdentity | null>;
  getStaffMemberships(): Promise<StaffMembership[]>;
  getCustomerMemberships(): Promise<CustomerMembership[]>;
  getStaffMembership(breweryId: string): Promise<StaffMembership | null>;
  getCustomerMembership(breweryId: string): Promise<CustomerMembership | null>;
}

/**
 * Composes auth work for one non-RSC request, including route handlers.
 * Each resolver shares one client and one promise per lookup within this context.
 */
export function createRequestAuthContext(createClient: RequestClientFactory = createServerClient): RequestAuthContext {
  let client: Promise<SupabaseClient> | undefined;
  let identity: Promise<RequestIdentity | null> | undefined;
  let staffMemberships: Promise<StaffMembership[]> | undefined;
  let customerMemberships: Promise<CustomerMembership[]> | undefined;

  const getSupabaseClient = () => (client ??= createClient());
  const getIdentity = () => (identity ??= (async () => {
    const db = await getSupabaseClient();
    const { data, error } = await db.auth.getClaims();
    const userId = data?.claims.sub;
    if (error || typeof userId !== "string") return null;
    const email = data?.claims.email;
    return { userId, email: typeof email === "string" ? email : null };
  })());
  const getStaffMemberships = () => (staffMemberships ??= (async () => {
    const requestIdentity = await getIdentity();
    if (!requestIdentity) return [];

    const db = await getSupabaseClient();
    const { data, error } = await db
      .from("brewery_users")
      .select("brewery_id, role")
      .eq("user_id", requestIdentity.userId)
      .returns<StaffMembershipRow[]>();
    if (error) throw error;

    const breweryIds = (data ?? []).map((row) => row.brewery_id);
    const { data: breweries, error: breweryError } = breweryIds.length
      ? await db.from("staff_brewery").select("id, name").in("id", breweryIds)
      : { data: [], error: null };
    if (breweryError) throw breweryError;
    const breweryNames = new Map((breweries ?? []).map((brewery) => [brewery.id, brewery.name]));
    return (data ?? []).map(({ brewery_id, role }) => {
      const breweryName = breweryNames.get(brewery_id);
      if (!breweryName) throw new Error("staff membership brewery is unavailable");
      return { breweryId: brewery_id, breweryName, role };
    });
  })());
  const getCustomerMemberships = () => (customerMemberships ??= (async () => {
    const requestIdentity = await getIdentity();
    if (!requestIdentity) return [];

    const db = await getSupabaseClient();
    const { data, error } = await db
      .from("customer_users")
      .select("customer_id, customers!inner(brewery_id, name)")
      .eq("user_id", requestIdentity.userId)
      .returns<CustomerMembershipRow[]>();
    if (error) throw error;

    const breweryIds = [...new Set((data ?? []).map(({ customers }) => customers.brewery_id))];
    const { data: breweries, error: breweryError } = breweryIds.length
      ? await db.from("portal_brewery").select("id, name").in("id", breweryIds)
      : { data: [], error: null };
    if (breweryError) throw breweryError;
    const breweryNames = new Map((breweries ?? []).map((brewery) => [brewery.id, brewery.name]));

    return (data ?? []).map(({ customer_id, customers }) => {
      const breweryName = breweryNames.get(customers.brewery_id);
      if (!breweryName) throw new Error("customer membership brewery is unavailable");
      return { customerId: customer_id, breweryId: customers.brewery_id, breweryName, customerName: customers.name };
    });
  })());

  return {
    getSupabaseClient,
    getIdentity,
    getStaffMemberships,
    getCustomerMemberships,
    async getStaffMembership(breweryId) {
      return (await getStaffMemberships()).find((membership) => membership.breweryId === breweryId) ?? null;
    },
    async getCustomerMembership(breweryId) {
      return (await getCustomerMemberships()).find((membership) => membership.breweryId === breweryId) ?? null;
    },
  };
}


// RSC callers retain React's request cache. Route handlers use an explicit
// RequestAuthContext instead because React cache is scoped to RSC rendering.
const getRscRequestAuthContext = cache(() => createRequestAuthContext());
/** Returns the React-cached auth composition for an RSC request. */
export const getRequestAuthContext = cache(() => getRscRequestAuthContext());

/** Returns a JWT-verified request identity, or null when no valid session exists. */
export const getRequestIdentity = cache(() => getRscRequestAuthContext().getIdentity());

/** Returns every staff membership for the authenticated RSC request. */
export const getStaffMemberships = cache(() => getRscRequestAuthContext().getStaffMemberships());

/** Returns every customer membership for the authenticated RSC request. */
export const getCustomerMemberships = cache(() => getRscRequestAuthContext().getCustomerMemberships());

export const getStaffMembership = cache((breweryId: string) => getRscRequestAuthContext().getStaffMembership(breweryId));

export const getCustomerMembership = cache((breweryId: string) => getRscRequestAuthContext().getCustomerMembership(breweryId));

export const getRequestSupabaseClient = cache(() => getRscRequestAuthContext().getSupabaseClient());
