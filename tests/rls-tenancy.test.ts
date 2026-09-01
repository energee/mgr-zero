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

  it("staff of A cannot directly insert customers into their own brewery", async () => {
    const db = await asUser(staffA.email);
    const { error } = await db.from("customers").insert({ brewery_id: bA.id, name: "raw own brewery customer", state: "PA" });
    expect(error?.code).toBe("42501");
  });

  it("customer user sees only their own customer record", async () => {
    const db = await asUser(custB.user.email);
    const { data } = await db.from("customers").select("id");
    expect(data).toHaveLength(1);
    expect(data![0].id).toBe(custB.customer.id);
  });
});

describe("brewery column exposure", () => {
  const secrets = {
    ttb_registry_no: "TTB-SECRET-123",
    pa_license_no: "PA-LIC-999",
    settings: { internal_note: "do not show customers" },
  };
  let brewery: { id: string; name: string };
  let staff: { email: string };
  let customer: { id: string };
  let customerUser: { email: string };
  let otherBrewery: { id: string };

  beforeAll(async () => {
    brewery = await makeBrewery();
    otherBrewery = await makeBrewery();
    const { error } = await admin.from("breweries").update({
      ...secrets,
      timezone: "America/Chicago",
    }).eq("id", brewery.id);
    if (error) throw error;
    staff = await makeStaff(brewery.id, "admin");
    const { data: c, error: customerError } = await admin
      .from("customers")
      .insert({ brewery_id: brewery.id, name: "Portal Bar", state: "PA" })
      .select()
      .single();
    if (customerError) throw customerError;
    customer = c;
    customerUser = await makeCustomerUser(c.id);
    // Other brewery has its own customer so a projection that only checks
    // "has some customer" (dropping my_customer_ids) would leak it.
    const { error: otherCustomerError } = await admin
      .from("customers")
      .insert({ brewery_id: otherBrewery.id, name: "Other Portal Bar", state: "NY" });
    if (otherCustomerError) throw otherCustomerError;
  });

  it("lets staff read ttb_registry_no, pa_license_no, and settings", async () => {
    const db = await asUser(staff.email);
    const { data, error } = await db.from("breweries").select("*").eq("id", brewery.id).single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ id: brewery.id, ...secrets });
  });

  it("does not return staff-only brewery columns to a portal customer", async () => {
    const db = await asUser(customerUser.email);
    const { data, error } = await db.from("breweries").select("*").eq("id", brewery.id);
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);

    const { data: embedded } = await db
      .from("customers")
      .select("id, breweries(*)")
      .eq("id", customer.id)
      .single();
    expect(embedded?.id).toBe(customer.id);
    expect(embedded?.breweries).toBeNull();
  });

  it("exposes only the portal brewery projection to a customer", async () => {
    const db = await asUser(customerUser.email);
    const expected = {
      id: brewery.id,
      name: brewery.name,
      timezone: "America/Chicago",
      portal_fulfillment_location_id: null,
    };
    const { data, error } = await db.from("portal_brewery").select("*").eq("id", brewery.id).single();
    expect(error).toBeNull();
    expect(data).toEqual(expected);

    const { data: listed } = await db.from("portal_brewery").select("id");
    expect(listed).toEqual([{ id: brewery.id }]);
    const { data: other } = await db.from("portal_brewery").select("id").eq("id", otherBrewery.id);
    expect(other ?? []).toEqual([]);

    const rpc = await db.rpc("portal_brewery_rows");
    expect(rpc.error).toBeNull();
    expect(rpc.data).toEqual([expected]);
  });

  it("lets a customer read only the configured portal warehouse", async () => {
    const { data: warehouse, error: warehouseError } = await admin
      .from("locations")
      .insert({ brewery_id: brewery.id, name: "Portal WH", kind: "warehouse" })
      .select()
      .single();
    if (warehouseError) throw warehouseError;
    const { data: other, error: otherError } = await admin
      .from("locations")
      .insert({ brewery_id: brewery.id, name: "Other WH", kind: "warehouse" })
      .select()
      .single();
    if (otherError) throw otherError;
    const staffDb = await asUser(staff.email);
    const { error: setError } = await staffDb.rpc("set_portal_fulfillment_source", {
      p_brewery: brewery.id, p_location: warehouse.id,
    });
    expect(setError).toBeNull();

    const db = await asUser(customerUser.email);
    const { data, error } = await db.from("locations").select("id");
    expect(error).toBeNull();
    expect(data?.map((r) => r.id)).toEqual([warehouse.id]);
    expect(data?.map((r) => r.id)).not.toContain(other.id);

    const { data: projected } = await db.from("portal_brewery").select("portal_fulfillment_location_id").eq("id", brewery.id).single();
    expect(projected?.portal_fulfillment_location_id).toBe(warehouse.id);
  });
});
