// tests/commands-invites.test.ts — invite_staff / invite_customer_user are
// registered but fail closed (audit P1.9): no auth-admin call and no
// membership row may result. Role and input checks still run first.
import { describe, it, expect, beforeAll } from "vitest";
import { makeBrewery, makeStaffCtx, admin } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

describe("invitations (blocked)", () => {
  let adminCtx: any, warehouseCtx: any, b: any;
  beforeAll(async () => {
    b = await makeBrewery();
    adminCtx = await makeStaffCtx(b.id, "admin");
    warehouseCtx = await makeStaffCtx(b.id, "warehouse");
  });

  it("invite_staff fails closed for admins and creates no membership", async () => {
    const email = `${crypto.randomUUID()}@test.local`;
    await expect(runCommand("invite_staff", { email, role: "sales" }, adminCtx)).rejects.toThrow(/not available/i);
    const { data } = await admin.from("brewery_users").select("user_id").eq("brewery_id", b.id).eq("role", "sales");
    expect(data).toEqual([]);
  });

  it("warehouse role still gets a permission error, not the block", async () => {
    await expect(runCommand("invite_staff", { email: "x@test.local", role: "sales" }, warehouseCtx))
      .rejects.toThrow(/permission/i);
  });

  it("invite_customer_user fails closed even for the brewery's own customer", async () => {
    const { data: c, error } = await admin.from("customers")
      .insert({ brewery_id: b.id, name: "Own Co", state: "PA" }).select().single();
    if (error) throw error;
    await expect(runCommand("invite_customer_user", { email: `${crypto.randomUUID()}@test.local`, customerId: c.id }, adminCtx))
      .rejects.toThrow(/not available/i);
    const { data } = await admin.from("customer_users").select("user_id").eq("customer_id", c.id);
    expect(data).toEqual([]);
  });

  it("list_team_members still works", async () => {
    const members = await runCommand("list_team_members", {}, adminCtx);
    expect(members.some((m: any) => m.role === "admin")).toBe(true);
  });
});
