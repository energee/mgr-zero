// tests/route-context-reads.test.ts — a staff /api/command request resolves its
// roles from the one brewery_users row it needs, without the staff_brewery
// projection (name, timezone) that only page layouts print (#759). Pure: the
// Supabase client is a stub that records which tables and filters each request
// reads, applies `eq`, and rejects a malformed uuid with 22P02 as Postgres does.
import { beforeEach, describe, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => [] as { table: string; eq: [string, unknown][] }[]);
const scopes = vi.hoisted(() => [] as Record<string, string>[]);
const selection = vi.hoisted(() => ({ customerId: undefined as string | undefined }));
// Tables whose reads never settle, to prove another read does not wait on them.
const hanging = vi.hoisted(() => new Set<string>());
const BREWERY = "00000000-0000-4000-8000-000000000001";
const USER = "00000000-0000-4000-8000-000000000002";
const OTHER_BREWERY = "00000000-0000-4000-8000-000000000003";
const CUSTOMER = "00000000-0000-4000-8000-000000000004";
const OTHER_CUSTOMER = "00000000-0000-4000-8000-000000000005";

vi.mock("@/lib/portal", () => ({ pickedCustomerId: async () => selection.customerId }));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async (headers?: Record<string, string>) => {
    if (headers) scopes.push(headers);
    const tables: Record<string, Record<string, unknown>[]> = {
      brewery_users: [
        { user_id: USER, brewery_id: BREWERY, roles: ["admin", "sales"] },
        { user_id: USER, brewery_id: OTHER_BREWERY, roles: ["sales", "brewer"] },
      ],
      staff_brewery: [{ id: BREWERY, name: "Brewery", timezone: "America/New_York" }, { id: OTHER_BREWERY, name: "Other", timezone: "America/New_York" }],
      portal_customers: [
        { id: CUSTOMER, brewery_id: BREWERY, name: "Buyer" },
        { id: OTHER_CUSTOMER, brewery_id: BREWERY, name: "Other buyer" },
      ],
      portal_brewery: [{ id: BREWERY, name: "Brewery" }],
    };
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    return {
      auth: { getClaims: async () => ({ data: { claims: { sub: USER } }, error: null }) },
      from(table: string) {
        const read = { table, eq: [] as [string, unknown][] };
        reads.push(read);
        let rows = [...(tables[table] ?? [])];
        let error: { message: string; code: string } | null = null;
        const query = {
          select: () => query, in: () => query, limit: () => query, returns: () => query,
          eq(column: string, value: unknown) {
            read.eq.push([column, value]);
            if (column.endsWith("_id") && !uuid.test(String(value))) error = { message: "invalid input syntax for type uuid", code: "22P02" };
            rows = rows.filter(row => row[column] === value);
            return query;
          },
          maybeSingle: () => Promise.resolve({ data: error ? null : rows[0] ?? null, error }),
          then: (resolve: (value: { data: unknown[] | null; error: typeof error }) => unknown) =>
            hanging.has(table) ? new Promise(() => {}) : Promise.resolve(resolve({ data: error ? null : rows, error })),
        };
        return query;
      },
    };
  },
}));

import { createRequestAuthContext } from "@/lib/auth/request-context";
import { buildRouteContext, ctxForBearer } from "@/lib/commands/context";

beforeEach(() => { reads.length = 0; scopes.length = 0; selection.customerId = undefined; hanging.clear(); });

describe("command route context (#759)", () => {
  it("reads all the caller's roles at this brewery without the staff_brewery projection", async () => {
    expect(await buildRouteContext(OTHER_BREWERY)).toMatchObject({ breweryId: OTHER_BREWERY, roles: ["sales", "brewer"] });
    expect(reads.map(read => read.table)).toEqual(["brewery_users"]);
    expect(reads[0].eq).toEqual(expect.arrayContaining([["user_id", USER], ["brewery_id", OTHER_BREWERY]]));
    expect(scopes).toEqual([{ "x-mgr-actor-id": USER, "x-mgr-brewery-id": OTHER_BREWERY }]);
  });

  // staff_brewery and portal_brewery already return only the caller's
  // breweries, so a layout's two membership reads cost one round trip, not two.
  it("reads staff_brewery without waiting for brewery_users", async () => {
    hanging.add("brewery_users");
    void createRequestAuthContext().getStaffMemberships();
    await vi.waitFor(() => expect(reads.map(read => read.table)).toEqual(["brewery_users", "staff_brewery"]));
  });

  it("reads portal_brewery without waiting for portal_customers", async () => {
    hanging.add("portal_customers");
    void createRequestAuthContext().getCustomerMemberships();
    await vi.waitFor(() => expect(reads.map(read => read.table)).toEqual(["portal_customers", "portal_brewery"]));
  });

  it("reuses memberships a page already loaded instead of reading roles again", async () => {
    const request = createRequestAuthContext();
    expect(await request.getStaffMemberships()).toEqual(expect.arrayContaining([
      expect.objectContaining({ breweryId: BREWERY, roles: ["admin", "sales"] }),
    ]));
    reads.length = 0;
    expect(await request.getStaffRoles(BREWERY)).toEqual(["admin", "sales"]);
    expect(reads).toEqual([]);
  });

  it("uses the same roles lookup for bearer contexts", async () => {
    const request = createRequestAuthContext();
    expect(await ctxForBearer(await request.getSupabaseClient(), USER, OTHER_BREWERY))
      .toMatchObject({ roles: ["sales", "brewer"] });
    expect(reads.map(read => read.table)).toEqual(["brewery_users"]);
  });

  it("selects only customer roles and customer scope for an explicit portal request by staff", async () => {
    const expected = { actorId: USER, breweryId: BREWERY, customerId: CUSTOMER };
    expect(await buildRouteContext(BREWERY, expected)).toMatchObject({ roles: ["customer"], customerId: CUSTOMER });
    expect(reads.map(read => read.table)).toEqual(["portal_customers", "portal_brewery"]);
    expect(scopes).toEqual([{ "x-mgr-actor-id": USER, "x-mgr-brewery-id": BREWERY, "x-mgr-customer-id": CUSTOMER }]);
  });

  it("rejects a changed actor before creating a scoped cookie client", async () => {
    await expect(buildRouteContext(BREWERY, { actorId: CUSTOMER, breweryId: BREWERY }))
      .rejects.toMatchObject({ status: 409, code: "context_changed" });
    expect(scopes).toEqual([]);
  });

  it("rejects a switched portal account rather than using the actor's staff roles", async () => {
    selection.customerId = OTHER_CUSTOMER;
    await expect(buildRouteContext(BREWERY, { actorId: USER, breweryId: BREWERY, customerId: CUSTOMER }))
      .rejects.toMatchObject({ status: 409, code: "context_changed" });
    expect(reads.map(read => read.table)).toEqual(["portal_customers", "portal_brewery"]);
    expect(scopes).toEqual([]);
  });

  it("keeps the pre-tenant context role-free and without a tenant scope", async () => {
    expect(await buildRouteContext()).toMatchObject({ breweryId: null, roles: [] });
    expect(scopes).toEqual([{ "x-mgr-actor-id": USER }]);
    expect(reads).toEqual([]);
  });

  it("treats a non-UUID breweryId as not-a-member before any read, never a 500", async () => {
    await expect(buildRouteContext("not-a-uuid")).rejects.toMatchObject({ status: 403, code: "not_member" });
    expect(reads).toEqual([]);
  });
});
