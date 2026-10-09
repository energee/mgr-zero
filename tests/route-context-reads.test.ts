// tests/route-context-reads.test.ts — a staff /api/command request resolves its
// role from the one brewery_users row it needs, without the staff_brewery
// projection (name, timezone) that only page layouts print (#759). Pure: the
// Supabase client is a stub that records which tables and filters each request
// reads, applies `eq`, and rejects a malformed uuid with 22P02 as Postgres does.
import { beforeEach, describe, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => [] as { table: string; eq: [string, unknown][] }[]);
const BREWERY = "00000000-0000-4000-8000-000000000001";
const USER = "00000000-0000-4000-8000-000000000002";
const OTHER_BREWERY = "00000000-0000-4000-8000-000000000003";

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => {
    const tables: Record<string, Record<string, unknown>[]> = {
      brewery_users: [
        { user_id: USER, brewery_id: BREWERY, role: "admin" },
        { user_id: USER, brewery_id: OTHER_BREWERY, role: "warehouse" },
      ],
      staff_brewery: [{ id: BREWERY, name: "Brewery", timezone: "America/New_York" }, { id: OTHER_BREWERY, name: "Other", timezone: "America/New_York" }],
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
          then: (resolve: (value: { data: unknown[] | null; error: typeof error }) => unknown) => Promise.resolve(resolve({ data: error ? null : rows, error })),
        };
        return query;
      },
    };
  },
}));

import { createRequestAuthContext } from "@/lib/auth/request-context";
import { buildRouteContext } from "@/lib/commands/context";

beforeEach(() => { reads.length = 0; });

describe("command route context (#759)", () => {
  it("reads the caller's role at this brewery without the staff_brewery projection", async () => {
    expect(await buildRouteContext(OTHER_BREWERY)).toMatchObject({ breweryId: OTHER_BREWERY, role: "warehouse" });
    expect(reads.map(read => read.table)).toEqual(["brewery_users"]);
    expect(reads[0].eq).toEqual(expect.arrayContaining([["user_id", USER], ["brewery_id", OTHER_BREWERY]]));
  });

  it("reuses memberships a page already loaded instead of reading the role again", async () => {
    const request = createRequestAuthContext();
    await request.getStaffMemberships();
    reads.length = 0;
    expect(await request.getStaffRole(BREWERY)).toBe("admin");
    expect(reads).toEqual([]);
  });

  it("treats a non-UUID breweryId as not-a-member before any read, never a 500", async () => {
    await expect(buildRouteContext("not-a-uuid")).rejects.toMatchObject({ status: 403, code: "not_member" });
    expect(reads).toEqual([]);
  });
});
