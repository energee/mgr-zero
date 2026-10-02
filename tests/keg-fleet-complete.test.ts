// Real RLS-bound fleet/report agreement beyond every holdings and label row cap (#726).
import { expect, it } from "vitest";
import { admin, makeBrewery, makeStaffCtx, seedCustomer, seedLocation } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

it("returns complete named bin/customer holdings agreeing with the full keg report", async () => {
  const brewery = await makeBrewery();
  const ctx = await makeStaffCtx(brewery.id, "warehouse");
  const location = await seedLocation(brewery.id);
  const customer = await seedCustomer(brewery.id);
  const rows = Array.from({ length: 1001 }, (_, n) => ({
    pool: crypto.randomUUID(), customer: crypto.randomUUID(), location: crypto.randomUUID(), bin: crypto.randomUUID(), name: `Fleet ${String(n).padStart(4, "0")}`,
  }));
  const pools = await admin.from("keg_pools").insert(rows.map(r => ({ id: r.pool, brewery_id: brewery.id, name: r.name, kind: "owned" as const })));
  if (pools.error) throw pools.error;
  const customers = await admin.from("customers").insert(rows.map(r => ({ id: r.customer, brewery_id: brewery.id, name: r.name, state: "PA", sale_channel_id: customer.saleChannelId })));
  if (customers.error) throw customers.error;
  const locations = await admin.from("locations").insert(rows.map(r => ({ id: r.location, brewery_id: brewery.id, name: r.name, uses: ["storage"] })));
  if (locations.error) throw locations.error;
  const bins = await admin.from("bins").insert(rows.map(r => ({ id: r.bin, brewery_id: brewery.id, name: r.name, location_id: r.location })));
  if (bins.error) throw bins.error;
  const event = { brewery_id: brewery.id, created_by: ctx.userId, keg_size: "half_bbl" as const, qty: 3 };
  const events = await admin.from("keg_events").insert(rows.flatMap(r => [
    { ...event, pool_id: r.pool, location_id: r.location, bin_id: r.bin, reason: "acquired" as const, qty: 5 },
    { ...event, pool_id: r.pool, location_id: r.location, bin_id: r.bin, reason: "shipped" as const, customer_id: r.customer },
  ]));
  if (events.error) throw events.error;
  const extra = await admin.from("keg_events").insert([
    { ...event, pool_id: rows[0].pool, location_id: location.id, bin_id: location.binId, keg_size: "sixth_bbl", reason: "acquired", qty: 7 },
    { ...event, pool_id: rows[0].pool, location_id: location.id, bin_id: location.binId, keg_size: "sixth_bbl", reason: "shipped", customer_id: rows[0].customer, qty: 7 },
    { ...event, pool_id: rows[1].pool, location_id: location.id, bin_id: location.binId, reason: "acquired", qty: 4 },
    { ...event, pool_id: rows[1].pool, location_id: location.id, bin_id: location.binId, reason: "shipped", customer_id: rows[0].customer, qty: 4 },
  ]);
  if (extra.error) throw extra.error;
  const fleet = await runCommand("get_keg_fleet", {}, ctx) as {
    pools: { id: string }[]; rows: { qty: number; location_name: string; bin_name: string }[];
    customers: { customer_id: string; name: string; kegs_out: number }[];
  };
  expect(fleet.pools).toHaveLength(1001);
  expect(fleet.rows).toHaveLength(1003);
  expect(fleet.rows.every(r => r.location_name && r.bin_name)).toBe(true);
  expect(fleet.rows.filter(r => r.qty === 0)).toHaveLength(2);
  expect(fleet.customers).toHaveLength(1001);
  expect(fleet.customers.every(r => r.name)).toBe(true);
  expect(fleet.customers.find(r => r.customer_id === rows[0].customer)?.kegs_out).toBe(14);
  const out = fleet.customers.reduce((n, r) => n + r.kegs_out, 0);
  expect(out).toBe(3014);
  const report = await runCommand("get_keg_report", {}, ctx) as {
    fleet: { out: number; total: number }; customers: { name: string }[]; bySize: { pool_name: string }[];
  };
  expect.soft(report.customers.every(r => r.name)).toBe(true);
  expect.soft(report.bySize.every(r => r.pool_name)).toBe(true);
  expect.soft(report.fleet.out).toBe(out);
  expect.soft(report.fleet.total).toBe(out + fleet.rows.reduce((n, r) => n + r.qty, 0));
  const empty = await makeBrewery();
  const emptyCtx = await makeStaffCtx(empty.id, "warehouse");
  expect(await runCommand("get_keg_fleet", {}, emptyCtx)).toEqual({ pools: [], rows: [], customers: [] });
}, 60000);
