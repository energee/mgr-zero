// tests/not-found.test.ts — a missing or malformed record id is a 404/400
// CommandError, never a raw PostgREST message (docs/audits 2026-09-05, findings
// 1–3): get_* and portal_order commands, and the
// bearer context's handling of membership-query failures.
import { describe, it, expect, beforeAll, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { asUser, makeBrewery, makeCustomerUser, makeStaffCtx, seedCustomer } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import { ctxForBearer } from "@/lib/commands/context";
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

describe("portal_order with an unknown or malformed id (review on #144)", () => {
  let cust: { db: Awaited<ReturnType<typeof asUser>>; userId: string; breweryId: string; role: "customer"; customerId: string };
  beforeAll(async () => {
    const { customerId } = await seedCustomer(ctx.breweryId);
    const user = await makeCustomerUser(customerId);
    cust = { db: await asUser(user.email), userId: user.id, breweryId: ctx.breweryId, role: "customer", customerId };
  });
  it("unknown uuid → 404 not_found", async () => {
    await expect(runCommand("portal_order", { orderId: NIL }, cust)).rejects.toMatchObject({ status: 404, code: "not_found" });
  });
  it("non-uuid → 400 invalid_input", async () => {
    await expect(runCommand("portal_order", { orderId: "abc" }, cust)).rejects.toMatchObject({ status: 400, code: "invalid_input" });
  });
});

describe("ctxForBearer", () => {
  it("surfaces a membership-query database failure as 500 db_error, not 403 not_member", async () => {
    const failure = { data: null, error: { code: "57P01", message: "terminating connection due to administrator command" } };
    const chain = { select: () => chain, eq: () => chain, limit: () => Promise.resolve(failure), maybeSingle: () => Promise.resolve(failure) };
    const db = { from: () => chain } as unknown as SupabaseClient;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(ctxForBearer(db, "user", NIL)).rejects.toMatchObject({ status: 500, code: "db_error" });
    log.mockRestore();
  });
});
