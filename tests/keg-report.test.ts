// tests/keg-report.test.ts — get_keg_report (issue #278, Keg report): fleet
// utilization from keg_fleet_totals and FIFO aging of unreturned kegs.
import { beforeAll, describe, expect, it } from "vitest";
import { admin, makeBrewery, makeStaffCtx, seedCustomer, seedLocation } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

type Report = {
  fleet: { out: number; total: number; utilization: number | null };
  bySize: { pool_id: string; pool_name: string; keg_size: string; out: number; total: number }[];
  aging: { bucket: string; kegs: number; deposit_cents: number }[];
  customers: { customer_id: string; name: string; over_90: number; oldest_at: string | null }[];
};

let b: { id: string };
let ctx: Awaited<ReturnType<typeof makeStaffCtx>>;
let poolId: string;
let customerId: string;

beforeAll(async () => {
  b = await makeBrewery();
  ctx = await makeStaffCtx(b.id, "warehouse");
  const storage = await seedLocation(b.id, { name: "Storage", uses: ["storage"] });
  ({ customerId } = await seedCustomer(b.id, { name: "Ridgeline Tap Room" }));
  poolId = ((await runCommand("create_keg_pool", { name: "Owned", kind: "owned", depositCents: 3000 }, ctx)) as { id: string }).id;
  const event = (i: Record<string, unknown>) => runCommand("record_keg_event", { poolId, kegSize: "half_bbl", locationId: storage.id, binId: storage.binId, ...i }, ctx) as Promise<{ id: string }>;
  await event({ qty: 10, reason: "acquired" });
  const old = await event({ qty: 4, reason: "shipped", customerId });
  await admin.from("keg_events").update({ at: "2026-05-01T00:00:00Z" }).eq("id", old.id);
  await event({ qty: 2, reason: "shipped", customerId });
  await event({ qty: 3, reason: "returned", customerId });
});

describe("get_keg_report", () => {
  it("utilization is out over fleet and aging is FIFO", async () => {
    const r = (await runCommand("get_keg_report", {}, ctx)) as Report;
    expect(r.fleet).toMatchObject({ out: 3, total: 10 });
    expect(r.fleet.utilization).toBeCloseTo(0.3);
    expect(r.bySize).toEqual([{ pool_id: poolId, pool_name: "Owned", keg_size: "half_bbl", out: 3, total: 10 }]);
    expect(r.aging.map((a) => [a.bucket, a.kegs, a.deposit_cents])).toEqual([["0-30", 2, 6000], ["31-60", 0, 0], ["61-90", 0, 0], ["90+", 1, 3000]]);
    expect(r.customers).toEqual([{ customer_id: customerId, name: "Ridgeline Tap Room", over_90: 1, oldest_at: "2026-05-01T00:00:00+00:00" }]);
  });

  it("a brewer cannot read it", async () => {
    const brewer = await makeStaffCtx(b.id, "brewer");
    await expect(runCommand("get_keg_report", {}, brewer)).rejects.toThrow();
  });
});

// #455: keg_events was read unordered and unpaged, so past PostgREST's
// 1000-row cap aging ran on an arbitrary subset. 1001 one-keg shipments must
// all count.
describe("get_keg_report past the 1000-row cap", () => {
  it("ages every shipment", async () => {
    const big = await makeBrewery();
    const bigCtx = await makeStaffCtx(big.id, "warehouse");
    const storage = await seedLocation(big.id, { name: "Storage", uses: ["storage"] });
    const { customerId: holder } = await seedCustomer(big.id, { name: "Big Holder" });
    const pool = ((await runCommand("create_keg_pool", { name: "Owned", kind: "owned", depositCents: 0 }, bigCtx)) as { id: string }).id;
    const event = (i: Record<string, unknown>) => runCommand("record_keg_event", { poolId: pool, kegSize: "half_bbl", locationId: storage.id, binId: storage.binId, ...i }, bigCtx) as Promise<{ id: string }>;
    await event({ qty: 1001, reason: "acquired" });
    const first = await event({ qty: 1, reason: "shipped", customerId: holder });
    const { data: row, error } = await admin.from("keg_events").select("*").eq("id", first.id).single();
    if (error) throw error;
    const copy: Partial<typeof row> = { ...row };
    delete copy.id;
    const inserted = await admin.from("keg_events").insert(Array.from({ length: 1000 }, () => copy as typeof row));
    if (inserted.error) throw inserted.error;

    const r = (await runCommand("get_keg_report", {}, bigCtx)) as Report;
    expect(r.aging.reduce((n, a) => n + a.kegs, 0)).toBe(1001);
    expect(r.fleet.out).toBe(1001);
  });
});

