// tests/rls-orders.test.ts — order_events RLS + append-only; customer scoping for 1B tables.
import { describe, it, expect, beforeAll } from "vitest";
import { admin, makeBrewery, makeStaff, makeCustomerUser, asUser } from "./helpers";

let b1: { id: string }, b2: { id: string };
let staff1: { id: string; email: string }, staff2: { id: string; email: string };
let customer: { id: string }, custUser: { id: string; email: string };
let order: { id: string };
let whId: string;

beforeAll(async () => {
  b1 = await makeBrewery(); b2 = await makeBrewery();
  staff1 = await makeStaff(b1.id); staff2 = await makeStaff(b2.id);
  const { data: c } = await admin.from("customers").insert({ brewery_id: b1.id, name: "Bar X", type: "retailer", state: "PA" }).select().single();
  customer = c!;
  custUser = await makeCustomerUser(customer.id);
  const { data: loc } = await admin.from("locations").insert({ brewery_id: b1.id, name: "WH", kind: "warehouse" }).select().single();
  whId = loc!.id;
  const { data: st } = await admin.from("ship_tos").insert({ brewery_id: b1.id, customer_id: customer.id, label: "main", address1: "1 St", city: "Phila", state: "PA", zip: "19100" }).select().single();
  const { data: o } = await admin.from("orders").insert({ brewery_id: b1.id, kind: "wholesale", customer_id: customer.id, ship_to_id: st!.id, from_location_id: whId, created_by: staff1.id }).select().single();
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

// R3 (spec decision 2 enforcement): a submitted order is locked from customer
// edits — only the draft->submitted transition remains writable for the portal.
describe("customer writes are locked once an order leaves draft", () => {
  it("a direct update on a confirmed order is denied (42501)", async () => {
    const { data: confirmed } = await admin.from("orders")
      .update({ status: "confirmed" }).eq("id", order.id).select().single();
    expect(confirmed!.status).toBe("confirmed");
    const db = await asUser(custUser.email);
    const { error } = await db.from("orders").update({ note: "x" }).eq("id", order.id).select();
    expect(error?.code).toBe("42501"); // no direct DML grant: writes go through the command RPCs
  });

  it("a direct update on a submitted order's note is denied (42501)", async () => {
    const { data: st } = await admin.from("ship_tos").insert({ brewery_id: b1.id, customer_id: customer.id, label: "s2", address1: "2 St", city: "Phila", state: "PA", zip: "19100" }).select().single();
    const { data: o } = await admin.from("orders").insert({ brewery_id: b1.id, kind: "wholesale", customer_id: customer.id, ship_to_id: st!.id, from_location_id: whId, status: "submitted", created_by: staff1.id }).select().single();
    const db = await asUser(custUser.email);
    const { error } = await db.from("orders").update({ note: "x" }).eq("id", o!.id).select();
    expect(error?.code).toBe("42501"); // no direct DML grant: writes go through the command RPCs
  });

  it("a direct write to a submitted order's lines is denied (42501)", async () => {
    const { data: st } = await admin.from("ship_tos").insert({ brewery_id: b1.id, customer_id: customer.id, label: "s3", address1: "3 St", city: "Phila", state: "PA", zip: "19100" }).select().single();
    const { data: o } = await admin.from("orders").insert({ brewery_id: b1.id, kind: "wholesale", customer_id: customer.id, ship_to_id: st!.id, from_location_id: whId, status: "submitted", created_by: staff1.id }).select().single();
    const { data: p } = await admin.from("products").insert({ brewery_id: b1.id, name: "IPA" }).select().single();
    const { data: s } = await admin.from("skus").insert({ brewery_id: b1.id, product_id: p!.id, name: "IPA case", package_type: "can", bbl_per_unit: 0.0645 }).select().single();
    const { data: line } = await admin.from("order_lines").insert({ brewery_id: b1.id, order_id: o!.id, sku_id: s!.id, qty_ordered: 1, unit_price_cents: 100 }).select().single();
    const db = await asUser(custUser.email);
    const { error } = await db.from("order_lines").update({ qty_ordered: 99 }).eq("id", line!.id).select();
    expect(error?.code).toBe("42501"); // no direct DML grant: writes go through the command RPCs
  });
});
