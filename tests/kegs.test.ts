// tests/kegs.test.ts — Program 7: keg pools and the keg event ledger at
// location × bin grain. "36 in the taproom, 40 in storage" is two rows of
// keg_bin_totals, not one fleet number; shipped/returned move a customer's
// balance and need a customer, acquired/retired never carry one.
import { beforeAll, describe, expect, it } from "vitest";
import { admin, makeBrewery, makeStaffCtx, seedCustomer, seedLocation } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

let b: { id: string };
let ctx: Awaited<ReturnType<typeof makeStaffCtx>>;
let vendorId: string;
let taproom: Awaited<ReturnType<typeof seedLocation>>;
let storage: Awaited<ReturnType<typeof seedLocation>>;

beforeAll(async () => {
  b = await makeBrewery();
  ctx = await makeStaffCtx(b.id, "warehouse");
  const { data, error } = await admin.from("vendors").insert({ brewery_id: b.id, name: "Microstar" }).select("id").single();
  if (error) throw error;
  vendorId = data.id;
  taproom = await seedLocation(b.id, { name: "Taproom", kind: "taproom" });
  storage = await seedLocation(b.id, { name: "Storage", kind: "storage" });
});

const event = (i: Record<string, unknown>) => runCommand("record_keg_event", i, ctx);

describe("keg pools and location-grain events", () => {
  it("two locations of the same pool×size are independent balances", async () => {
    const pool = (await runCommand("create_keg_pool", { name: "Microstar", kind: "leased", vendorId }, ctx)) as { id: string; kind: string };
    expect(pool.kind).toBe("leased");
    await event({ poolId: pool.id, kegSize: "sixth_bbl", qty: 36, reason: "acquired", locationId: taproom.id, binId: taproom.binId });
    await event({ poolId: pool.id, kegSize: "sixth_bbl", qty: 40, reason: "acquired", locationId: storage.id, binId: storage.binId });

    const { data } = await admin.from("keg_bin_totals").select("location_id, qty").eq("pool_id", pool.id);
    const byLoc = Object.fromEntries(data!.map((r) => [r.location_id, Number(r.qty)]));
    expect(byLoc[taproom.id]).toBe(36);
    expect(byLoc[storage.id]).toBe(40);

    // The fleet page reads the same split through the registry, not the view directly.
    const fleet = (await runCommand("get_keg_fleet", {}, ctx)) as {
      pools: { id: string; name: string }[];
      rows: { pool_id: string; keg_size: string; location_id: string; bin_id: string; qty: number }[];
    };
    expect(fleet.pools.map((p) => p.id)).toContain(pool.id);
    expect(fleet.rows.filter((r) => r.pool_id === pool.id).map((r) => r.qty).sort()).toEqual([36, 40]);

    const updated = (await runCommand("update_keg_pool", { poolId: pool.id, name: "Microstar (leased)", active: false }, ctx)) as { name: string; active: boolean };
    expect(updated).toMatchObject({ name: "Microstar (leased)", active: false });
  });

  it("refuses shipped without a customer, a customer on found, and a bin outside the location", async () => {
    const pool = (await runCommand("create_keg_pool", { name: "Owned", kind: "owned" }, ctx)) as { id: string };
    const { customerId } = await seedCustomer(b.id, { name: "Al's" });
    await expect(event({ poolId: pool.id, kegSize: "half_bbl", qty: 1, reason: "shipped", locationId: taproom.id, binId: taproom.binId }))
      .rejects.toThrow(/customer/i);
    await expect(event({ poolId: pool.id, kegSize: "half_bbl", qty: 1, reason: "found", customerId, locationId: taproom.id, binId: taproom.binId }))
      .rejects.toThrow(/found/i);
    await expect(event({ poolId: pool.id, kegSize: "half_bbl", qty: 1, reason: "acquired", locationId: taproom.id, binId: storage.binId }))
      .rejects.toThrow(/bin/i);
    await expect(event({ poolId: pool.id, kegSize: "half_bbl", qty: 1, reason: "transferred_in", locationId: taproom.id, binId: taproom.binId }))
      .rejects.toThrow();
  });

  it("a leased pool needs a vendor and a pay-per-fill pool a per-fill cost, said plainly", async () => {
    await expect(runCommand("create_keg_pool", { name: "No vendor", kind: "leased" }, ctx)).rejects.toThrow(/vendor/i);
    await expect(runCommand("create_keg_pool", { name: "No cost", kind: "pay_per_fill", vendorId }, ctx)).rejects.toThrow(/per-fill/i);
    await expect(runCommand("create_keg_pool", { name: "Owned with vendor", kind: "owned", vendorId }, ctx)).rejects.toThrow(/vendor/i);
  });

  it("refuses to take out more kegs than the bin holds, and any event on a retired pool", async () => {
    const pool = (await runCommand("create_keg_pool", { name: "Small", kind: "owned" }, ctx)) as { id: string };
    await event({ poolId: pool.id, kegSize: "half_bbl", qty: 5, reason: "acquired", locationId: storage.id, binId: storage.binId });
    await expect(event({ poolId: pool.id, kegSize: "half_bbl", qty: 6, reason: "retired", locationId: storage.id, binId: storage.binId }))
      .rejects.toThrow(/not enough kegs/i);
    await expect(event({ poolId: pool.id, kegSize: "sixth_bbl", qty: 1, reason: "lost", locationId: storage.id, binId: storage.binId }))
      .rejects.toThrow(/not enough kegs/i);
    await runCommand("update_keg_pool", { poolId: pool.id, active: false }, ctx);
    await expect(event({ poolId: pool.id, kegSize: "half_bbl", qty: 1, reason: "acquired", locationId: storage.id, binId: storage.binId }))
      .rejects.toThrow(/out of service/i);
  });

  it("sales cannot touch the fleet", async () => {
    const sales = await makeStaffCtx(b.id, "sales");
    await expect(runCommand("create_keg_pool", { name: "Nope", kind: "owned" }, sales)).rejects.toThrow(/permission/i);
    await expect(runCommand("get_keg_fleet", {}, sales)).rejects.toThrow(/permission/i);
  });
});

describe("customer keg balance", () => {
  it("ship 4 halves, return 1, balance 3; no deposit invoiced reads 0 cents", async () => {
    const pool = (await runCommand("create_keg_pool", { name: "House", kind: "owned" }, ctx)) as { id: string };
    const { customerId } = await seedCustomer(b.id, { name: "Ridgeline" });
    await event({ poolId: pool.id, kegSize: "half_bbl", qty: 10, reason: "acquired", locationId: storage.id, binId: storage.binId });
    await event({ poolId: pool.id, kegSize: "half_bbl", qty: 4, reason: "shipped", customerId, locationId: storage.id, binId: storage.binId });
    await event({ poolId: pool.id, kegSize: "half_bbl", qty: 1, reason: "returned", customerId, locationId: storage.id, binId: storage.binId });

    const balance = (await runCommand("get_customer_keg_balance", { customerId }, ctx)) as {
      rows: { pool_id: string; keg_size: string; kegs_out: number; deposit_cents: number }[];
    };
    expect(balance.rows).toEqual([{ pool_id: pool.id, pool_name: "House", keg_size: "half_bbl", kegs_out: 3, deposit_cents: 0 }]);

    // Shipping and returning do not change the fleet; they move kegs to and
    // from the customer. The bin, though, physically holds 7.
    const { data } = await admin.from("keg_fleet_totals").select("qty").eq("pool_id", pool.id).single();
    expect(Number(data!.qty)).toBe(10);
    const fleet = (await runCommand("get_keg_fleet", {}, ctx)) as {
      rows: { pool_id: string; qty: number }[]; customers: { customer_id: string; name: string; kegs_out: number }[];
    };
    expect(fleet.rows.find((r) => r.pool_id === pool.id)?.qty).toBe(7);
    expect(fleet.customers).toEqual([{ customer_id: customerId, name: "Ridgeline", kegs_out: 3 }]);

    const history = (await runCommand("list_keg_events", { poolId: pool.id }, ctx)) as { reason: string; qty: number }[];
    expect(history.map((e) => e.reason)).toEqual(["returned", "shipped", "acquired"]);
    const both = (await runCommand("list_keg_events", { poolId: pool.id, customerId }, ctx)) as { reason: string }[];
    expect(both.map((e) => e.reason)).toEqual(["returned", "shipped"]);

    // Everything back: the customer drops off the balance and the fleet's customer list.
    await event({ poolId: pool.id, kegSize: "half_bbl", qty: 3, reason: "returned", customerId, locationId: storage.id, binId: storage.binId });
    const after = (await runCommand("get_customer_keg_balance", { customerId }, ctx)) as { rows: unknown[]; kegs_out: number };
    expect(after).toMatchObject({ rows: [], kegs_out: 0 });
    const fleetAfter = (await runCommand("get_keg_fleet", {}, ctx)) as { customers: unknown[] };
    expect(fleetAfter.customers).toEqual([]);
  });
});
