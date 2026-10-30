import type { Database } from "@/lib/supabase/database";
// lib/auth/request-context.ts — request-scoped Supabase identity and membership lookups shared by layouts and commands.
import { unwrap, type StaffRole } from "@/lib/commands/registry";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import type { GravityUnit } from "@/lib/mgr/gravity-unit";

export interface RequestIdentity {
  userId: string;
  /** From the session claims; the Me sheet prints it. */
  email: string | null;
}

export interface StaffMembership {
  breweryId: string;
  breweryName: string;
  roles: StaffRole[];
  /** breweries.timezone (IANA): every timestamp on a staff page prints in it (#442). */
  timeZone: string;
  gravityUnit: GravityUnit;
  myGravityUnit: GravityUnit | null;
}

export interface CustomerMembership {
  breweryId: string;
  breweryName: string;
  customerId: string;
  customerName: string;
}

type StaffMembershipRow = {
  brewery_id: string;
  roles: StaffMembership["roles"];
  gravity_unit: GravityUnit | null;
};

type CustomerMembershipRow = {
  id: string;
  brewery_id: string;
  name: string;
};

type RequestClientFactory = (headers?: Record<string, string>) => Promise<SupabaseClient<Database>>;

export interface RequestAuthContext {
  getSupabaseClient(): Promise<SupabaseClient<Database>>;
  getScopedSupabaseClient(headers: Record<string, string>): Promise<SupabaseClient<Database>>;
  getIdentity(): Promise<RequestIdentity | null>;
  getStaffMemberships(): Promise<StaffMembership[]>;
  getCustomerMemberships(): Promise<CustomerMembership[]>;
  /** The caller's roles at one brewery, or null when not staff there: the facts a command needs. */
  getStaffRoles(breweryId: string): Promise<StaffRole[] | null>;
  getCustomerMembership(breweryId: string, customerId?: string): Promise<CustomerMembership | null>;
}

/** One user's roles at one brewery (null when not staff there), read from the
 *  single brewery_users row; a database failure is a 500 db_error via unwrap.
 *  Shared by the cookie and bearer command contexts. */
export async function staffRolesAt(db: SupabaseClient<Database>, userId: string, breweryId: string): Promise<StaffRole[] | null> {
  const row = await unwrap(db.from("brewery_users").select("roles").eq("user_id", userId).eq("brewery_id", breweryId).maybeSingle());
  return row?.roles ?? null;
}

/** Where a signed-in account belongs: staff on Today, a buyer in the portal.
 *  Login and Save password land here; the password page uses it to keep a buyer on portal pages. */
export async function homePath(auth: RequestAuthContext) {
  if (!(await auth.getIdentity())) return "/login?error=1";
  if ((await auth.getStaffMemberships()).length) return "/";
  if ((await auth.getCustomerMemberships()).length) return "/portal";
  return "/no-membership";
}

/**
 * Composes auth work for one non-RSC request, including route handlers.
 * Each resolver shares one client and one promise per lookup within this context.
 */
export function createRequestAuthContext(createClient: RequestClientFactory = createServerClient): RequestAuthContext {
  let client: Promise<SupabaseClient<Database>> | undefined;
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
    // staff_brewery_rows() joins brewery_users on auth.uid(), so staff_brewery
    // returns only the caller's breweries without an id filter; both reads run
    // at once instead of the second waiting on the first's ids.
    const [{ data, error }, { data: breweries, error: breweryError }] = await Promise.all([
      db.from("brewery_users").select("brewery_id, roles, gravity_unit").eq("user_id", requestIdentity.userId).returns<StaffMembershipRow[]>(),
      db.from("staff_brewery").select("id, name, timezone, gravity_unit"),
    ]);
    if (error) throw error;
    if (breweryError) throw breweryError;
    const breweryRows = new Map((breweries ?? []).map((brewery) => [brewery.id, brewery]));
    return (data ?? []).map(({ brewery_id, roles, gravity_unit }) => {
      const brewery = breweryRows.get(brewery_id);
      if (!brewery?.name || !brewery.timezone) throw new Error("staff membership brewery is unavailable");
      return {
        breweryId: brewery_id, breweryName: brewery.name, roles, timeZone: brewery.timezone,
        gravityUnit: (brewery.gravity_unit ?? "plato") as GravityUnit,
        myGravityUnit: gravity_unit,
      };
    });
  })());
  const getCustomerMemberships = () => (customerMemberships ??= (async () => {
    const requestIdentity = await getIdentity();
    if (!requestIdentity) return [];

    const db = await getSupabaseClient();
    // portal_customers, not a customers embed: the buyer policy on the customers
    // base table would hide embedded rows. portal_brewery_rows() filters to
    // my_customer_ids(), so the brewery read needs no id filter and runs alongside.
    const [{ data, error }, { data: breweries, error: breweryError }] = await Promise.all([
      db.from("portal_customers").select("id, brewery_id, name").returns<CustomerMembershipRow[]>(),
      db.from("portal_brewery").select("id, name"),
    ]);
    if (error) throw error;
    if (breweryError) throw breweryError;
    const breweryNames = new Map((breweries ?? []).map((brewery) => [brewery.id, brewery.name]));

    return (data ?? []).map(({ id, brewery_id, name }) => {
      const breweryName = breweryNames.get(brewery_id);
      if (!breweryName) throw new Error("customer membership brewery is unavailable");
      return { customerId: id, breweryId: brewery_id, breweryName, customerName: name };
    });
  })());

  return {
    getSupabaseClient,
    getScopedSupabaseClient: (headers) => createClient(headers),
    getIdentity,
    getStaffMemberships,
    getCustomerMemberships,
    // A command needs only roles, so it reads one brewery_users row rather than
    // every membership plus the staff_brewery name/timezone a layout prints (#759).
    // When this request already loaded the memberships (getActiveBrewery does,
    // before buildContext), the roles come from them and keep their contract on
    // purpose: a page whose staff_brewery row is missing has already failed there.
    async getStaffRoles(breweryId) {
      if (staffMemberships) {
        const membership = (await staffMemberships).find((m) => m.breweryId === breweryId);
        return membership?.roles ?? null;
      }
      const requestIdentity = await getIdentity();
      if (!requestIdentity) return null;
      return staffRolesAt(await getSupabaseClient(), requestIdentity.userId, breweryId);
    },
    async getCustomerMembership(breweryId, customerId) {
      return (await getCustomerMemberships()).find((membership) => membership.breweryId === breweryId && (!customerId || membership.customerId === customerId)) ?? null;
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
