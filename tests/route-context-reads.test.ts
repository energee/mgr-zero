// tests/route-context-reads.test.ts — a staff /api/command request resolves its
// role from the one brewery_users row it needs, without the staff_brewery
// projection (name, timezone) that only page layouts print (#759). Pure: the
// Supabase client is a stub that records which tables each request reads.
import { beforeEach, describe, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => [] as string[]);
const BREWERY = "00000000-0000-4000-8000-000000000001";

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => {
    const result = (table: string) => {
      if (table === "brewery_users") return [{ brewery_id: BREWERY, role: "admin" }];
      if (table === "staff_brewery") return [{ id: BREWERY, name: "Brewery", timezone: "America/New_York" }];
      return [];
    };
    return {
      auth: { getClaims: async () => ({ data: { claims: { sub: "00000000-0000-4000-8000-000000000002" } }, error: null }) },
      from(table: string) {
        reads.push(table);
        const rows = result(table);
        const query = {
          select: () => query, eq: () => query, in: () => query, limit: () => query, returns: () => query,
          maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
          then: (resolve: (value: { data: unknown[]; error: null }) => unknown) => Promise.resolve(resolve({ data: rows, error: null })),
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
  it("reads the caller's role without the staff_brewery projection", async () => {
    expect(await buildRouteContext(BREWERY)).toMatchObject({ breweryId: BREWERY, role: "admin" });
    expect(reads).toEqual(["brewery_users"]);
  });

  it("reuses memberships a page already loaded instead of reading the role again", async () => {
    const request = createRequestAuthContext();
    await request.getStaffMemberships();
    reads.length = 0;
    expect(await request.getStaffRole(BREWERY)).toBe("admin");
    expect(reads).toEqual([]);
  });
});
