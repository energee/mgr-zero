// The report ages the ledger in PostgreSQL; these cases exercise that public,
// RLS-bound read rather than a second JavaScript implementation of FIFO.
import { describe, expect, it } from "vitest";
import { admin, ins, makeBrewery, makeStaffCtx, seedCustomer, seedLocation } from "./helpers";
import { unwrap } from "@/lib/commands/registry";

type Event = { reason: "shipped" | "returned" | "lost"; qty: number; at: string; customer?: number; size?: "half_bbl" | "sixth_bbl" };
async function aging(events: Event[]) {
  const brewery = await makeBrewery();
  const ctx = await makeStaffCtx(brewery.id, "warehouse");
  const location = await seedLocation(brewery.id, { uses: ["storage"] });
  const customers = await Promise.all([seedCustomer(brewery.id, { name: "First holder" }), seedCustomer(brewery.id, { name: "Second holder" })]);
  const pool = await ins("keg_pools", { brewery_id: brewery.id, name: "Owned", kind: "owned", deposit_cents: 3000 });
  const result = await admin.from("keg_events").insert(events.map((event, index) => ({
    brewery_id: brewery.id, pool_id: pool.id, location_id: location.id, bin_id: location.binId,
    customer_id: customers[event.customer ?? 0].customerId, keg_size: event.size ?? "half_bbl",
    reason: event.reason, qty: event.qty, at: event.at,
    created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(), created_by: ctx.userId,
  })));
  if (result.error) throw result.error;
  const report = await unwrap(ctx.db.rpc("get_keg_report_aging", { p_brewery: brewery.id }));
  if (!report) throw new Error("Keg aging report returned no data");
  return { ctx, brewery, customers, report };
}

describe("database FIFO keg aging", () => {
  it("retires oldest shipments first and splits a partially returned shipment", async () => {
    const { report, customers } = await aging([
      { reason: "shipped", qty: 3, at: "2026-05-01T00:00:00Z" },
      { reason: "shipped", qty: 5, at: "2026-08-20T00:00:00Z" },
      { reason: "returned", qty: 5, at: "2026-09-01T00:00:00Z" },
    ]);
    expect(report.bySize).toEqual([expect.objectContaining({ qty: 3 })]);
    expect(report.customers).toEqual([expect.objectContaining({ customer_id: customers[0].customerId, oldest_at: "2026-08-20T00:00:00+00:00" })]);
    expect(report.aging.reduce((sum, bucket) => sum + bucket.deposit_cents, 0)).toBe(9000);
  });

  it("keeps customers and sizes separate, counts losses and discards excess returns before later shipments", async () => {
    const { report, customers } = await aging([
      { reason: "returned", qty: 10, at: "2026-01-01T00:00:00Z" },
      { reason: "shipped", qty: 2, at: "2026-05-01T00:00:00Z" },
      { reason: "lost", qty: 1, at: "2026-06-01T00:00:00Z" },
      { reason: "shipped", qty: 3, at: "2026-05-01T00:00:00Z", customer: 1 },
      { reason: "shipped", qty: 4, at: "2026-05-01T00:00:00Z", size: "sixth_bbl" },
    ]);
    expect(report.bySize).toEqual(expect.arrayContaining([
      expect.objectContaining({ keg_size: "half_bbl", qty: 4 }),
      expect.objectContaining({ keg_size: "sixth_bbl", qty: 4 }),
    ]));
    expect(report.lost).toEqual([expect.objectContaining({ customer_id: customers[0].customerId, qty: 1 })]);
  });

  it("orders whole and fractional timestamps by instant and uses creation order for exact ties", async () => {
    const { report } = await aging([
      { reason: "shipped", qty: 2, at: "2026-09-01T10:00:00+00:00" },
      { reason: "returned", qty: 1, at: "2026-09-01T10:00:00+00:00" },
      { reason: "shipped", qty: 1, at: "2026-09-01T10:00:00.5+00:00" },
    ]);
    expect(report.bySize).toEqual([expect.objectContaining({ qty: 2 })]);
  });

  it("keeps cross-tenant and disallowed-role reads empty even with a supplied brewery id", async () => {
    const { brewery } = await aging([{ reason: "shipped", qty: 1, at: "2026-05-01T00:00:00Z" }]);
    const stranger = await makeStaffCtx((await makeBrewery()).id, "warehouse");
    const brewer = await makeStaffCtx(brewery.id, "brewer");
    const sales = await makeStaffCtx(brewery.id, "sales");
    for (const ctx of [stranger, brewer, sales]) {
      const report = await unwrap(ctx.db.rpc("get_keg_report_aging", { p_brewery: brewery.id }));
      expect(report).toEqual({ aging: [], bySize: [], customers: [], customerNames: [], lost: [] });
    }
  });
});
