// tests/rls-orders.test.ts — order_events RLS + append-only; customer scoping for 1B tables.
import { describe, it, expect, beforeAll } from "vitest";
import { admin, makeBrewery, makeStaff, makeCustomerUser, asUser } from "./helpers";

let b1: { id: string }, b2: { id: string };
let staff1: { id: string; email: string }, staff2: { id: string; email: string };
let customer: { id: string }, custUser: { id: string; email: string };
let order: { id: string };

beforeAll(async () => {
  b1 = await makeBrewery(); b2 = await makeBrewery();
  staff1 = await makeStaff(b1.id); staff2 = await makeStaff(b2.id);
  const { data: c } = await admin.from("customers").insert({ brewery_id: b1.id, name: "Bar X", type: "retailer", state: "PA" }).select().single();
  customer = c!;
  custUser = await makeCustomerUser(customer.id);
  const { data: loc } = await admin.from("locations").insert({ brewery_id: b1.id, name: "WH", kind: "warehouse" }).select().single();
  const { data: st } = await admin.from("ship_tos").insert({ brewery_id: b1.id, customer_id: customer.id, label: "main", address1: "1 St", city: "Phila", state: "PA", zip: "19100" }).select().single();
  const { data: o } = await admin.from("orders").insert({ brewery_id: b1.id, kind: "wholesale", customer_id: customer.id, ship_to_id: st!.id, from_location_id: loc!.id, created_by: staff1.id }).select().single();
  order = o!;
  await admin.from("order_events").insert({ brewery_id: b1.id, order_id: order.id, actor: staff1.id, event: "created" });
});

describe("order_events", () => {
  it("staff read own brewery; other brewery sees nothing", async () => {
    const db1 = await asUser(staff1.email);
    const { data } = await db1.from("order_events").select().eq("order_id", order.id);
    expect(data!.length).toBe(1);
    const db2 = await asUser(staff2.email);
    const { data: cross } = await db2.from("order_events").select().eq("order_id", order.id);
    expect(cross!.length).toBe(0);
  });
  it("customer reads events for own orders only", async () => {
    const db = await asUser(custUser.email);
    const { data } = await db.from("order_events").select().eq("order_id", order.id);
    expect(data!.length).toBe(1);
  });
  it("is append-only even for staff", async () => {
    const db1 = await asUser(staff1.email);
    const { error: upd } = await db1.from("order_events").update({ event: "tampered" }).eq("order_id", order.id);
    expect(upd).not.toBeNull();
    const { error: del } = await db1.from("order_events").delete().eq("order_id", order.id);
    expect(del).not.toBeNull();
  });
  it("orders.needs_restock exists and defaults false", async () => {
    const { data } = await admin.from("orders").select("needs_restock").eq("id", order.id).single();
    expect(data!.needs_restock).toBe(false);
  });
});
