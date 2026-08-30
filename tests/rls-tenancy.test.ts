// tests/rls-tenancy.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { admin, makeBrewery, makeStaff, makeCustomerUser, asUser } from "./helpers";

describe("tenancy RLS", () => {
  let bA: any, bB: any, staffA: any, custB: any;
  beforeAll(async () => {
    bA = await makeBrewery(); bB = await makeBrewery();
    staffA = await makeStaff(bA.id, "admin");
    const { data: c } = await admin.from("customers").insert({ brewery_id: bB.id, name: "Bar X", state: "PA" }).select().single();
    custB = { customer: c, user: await makeCustomerUser(c!.id) };
  });

  it("staff of A cannot see brewery B", async () => {
    const db = await asUser(staffA.email);
    const { data } = await db.from("breweries").select("id");
    expect(data!.map(r => r.id)).toContain(bA.id);
    expect(data!.map(r => r.id)).not.toContain(bB.id);
  });

  it("staff of A cannot insert customers into B", async () => {
    const db = await asUser(staffA.email);
    const { error } = await db.from("customers").insert({ brewery_id: bB.id, name: "sneaky", state: "PA" });
    expect(error).not.toBeNull();
  });

  it("customer user sees only their own customer record", async () => {
    const db = await asUser(custB.user.email);
    const { data } = await db.from("customers").select("id");
    expect(data).toHaveLength(1);
    expect(data![0].id).toBe(custB.customer.id);
  });
});
