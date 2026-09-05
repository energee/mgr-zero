// tests/not-found.test.ts — a missing or malformed record id is a 404/400
// CommandError, never a raw PostgREST message (docs/audits 2026-09-05, findings
// 1–3): get_* commands, the page-level predicate behind not-found.tsx, and the
// bearer context's handling of membership-query failures.
import { describe, it, expect, beforeAll, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { makeBrewery, makeStaffCtx } from "./helpers";
import { runCommand, CommandError } from "@/lib/commands/registry";
import { ctxForBearer } from "@/lib/commands/context";
import { isMissingRecord } from "@/lib/mgr/not-found";
import "@/lib/commands/all";

const NIL = "00000000-0000-0000-0000-000000000000";
let ctx: Awaited<ReturnType<typeof makeStaffCtx>>;

beforeAll(async () => {
  ctx = await makeStaffCtx((await makeBrewery()).id);
});

describe("get_* commands with an unknown or malformed id", () => {
  for (const [name, key] of [["get_order", "orderId"], ["get_customer", "customerId"], ["get_invoice", "invoiceId"]] as const) {
    it(`${name}: unknown uuid → 404 not_found`, async () => {
      await expect(runCommand(name, { [key]: NIL }, ctx)).rejects.toMatchObject({ status: 404, code: "not_found", message: "record not found" });
    });
    it(`${name}: non-uuid → 400 invalid_input`, async () => {
      await expect(runCommand(name, { [key]: "abc" }, ctx)).rejects.toMatchObject({ status: 400, code: "invalid_input" });
    });
  }
});

describe("isMissingRecord (detail pages → notFound())", () => {
  it("is true for not_found and invalid_input CommandErrors only", () => {
    expect(isMissingRecord(new CommandError("record not found", 404, "not_found"))).toBe(true);
    expect(isMissingRecord(new CommandError("validation failed", 400, "invalid_input"))).toBe(true);
    expect(isMissingRecord(new CommandError("database error", 500, "db_error"))).toBe(false);
    expect(isMissingRecord(new CommandError("permission denied", 403, "permission_denied"))).toBe(false);
    expect(isMissingRecord(new Error("record not found"))).toBe(false);
  });
});

describe("ctxForBearer", () => {
  it("surfaces a membership-query database failure as 500 db_error, not 403 not_member", async () => {
    const failure = { data: null, error: { code: "57P01", message: "terminating connection due to administrator command" } };
    const chain = { select: () => chain, eq: () => chain, limit: () => Promise.resolve(failure), maybeSingle: () => Promise.resolve(failure) };
    const db = { from: () => chain } as unknown as SupabaseClient;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(ctxForBearer(db, "user", "brewery")).rejects.toMatchObject({ status: 500, code: "db_error" });
    log.mockRestore();
  });
});
