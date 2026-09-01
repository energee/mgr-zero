// lib/auth/request-context.ts — request-scoped Supabase identity and membership lookups shared by layouts and commands.
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";

export interface RequestIdentity {
  userId: string;
}

export interface StaffMembership {
  breweryId: string;
  breweryName: string;
  role: "admin" | "sales" | "warehouse" | "brewer";
}

export interface CustomerMembership {
  breweryId: string;
  customerId: string;
  customerName: string;
}

type StaffMembershipRow = {
  brewery_id: string;
  role: StaffMembership["role"];
  breweries: { name: string };
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
    return { userId };
  })());
  const getStaffMemberships = () => (staffMemberships ??= (async () => {
    const requestIdentity = await getIdentity();
    if (!requestIdentity) return [];

    const db = await getSupabaseClient();
    const { data, error } = await db
      .from("brewery_users")
      .select("brewery_id, role, breweries!inner(name)")
      .eq("user_id", requestIdentity.userId)
      .returns<StaffMembershipRow[]>();
    if (error) throw error;

    return (data ?? []).map(({ brewery_id, role, breweries }) => ({
      breweryId: brewery_id,
      breweryName: breweries.name,
      role,
    }));
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

    return (data ?? []).map(({ customer_id, customers }) => ({
      customerId: customer_id,
      breweryId: customers.brewery_id,
      customerName: customers.name,
    }));
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
