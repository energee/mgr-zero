// tests/commands-invites.test.ts — invite_staff and invite_customer_user command tests.
import { describe, it, expect, beforeAll } from "vitest";
import { makeBrewery, makeStaff, asUser, admin } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

describe("invitations", () => {
  let adminCtx: any, warehouseCtx: any, b: any;
  beforeAll(async () => {
    b = await makeBrewery();
    for (const [role, slot] of [["admin", "adminCtx"], ["warehouse", "warehouseCtx"]] as const) {
      const u = await makeStaff(b.id, role);
      const db = await asUser(u.email);
      const { data: { user } } = await db.auth.getUser();
      const ctx = { db, userId: user!.id, breweryId: b.id, role };
      if (slot === "adminCtx") adminCtx = ctx; else warehouseCtx = ctx;
    }
  });

  it("admin invites staff; membership row created with role", async () => {
    const email = `${crypto.randomUUID()}@test.local`;
    const { userId } = await runCommand("invite_staff", { email, role: "sales" }, adminCtx);
    const { data } = await admin.from("brewery_users").select().eq("user_id", userId).eq("brewery_id", b.id).single();
    expect(data!.role).toBe("sales");
  });

  it("warehouse role cannot invite", async () => {
    await expect(runCommand("invite_staff", { email: "x@test.local", role: "sales" }, warehouseCtx))
      .rejects.toThrow(/permission/i);
  });

  it("invite_customer_user rejects a customer belonging to another brewery", async () => {
    const otherBrewery = await makeBrewery();
    const { data: otherCustomer, error } = await admin
      .from("customers")
      .insert({ brewery_id: otherBrewery.id, name: "Other Co", state: "PA" })
      .select()
      .single();
    if (error) throw error;

    const email = `${crypto.randomUUID()}@test.local`;
    await expect(
      runCommand("invite_customer_user", { email, customerId: otherCustomer.id }, adminCtx)
    ).rejects.toThrow(/customer/i);
  });
});
