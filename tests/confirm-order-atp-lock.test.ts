// tests/confirm-order-atp-lock.test.ts — issue #1035: two orders for the
// same SKU confirmed at the same moment must not both skip the oversell
// warning. Two connections interleave real transactions: A's confirm is
// still open when B's starts, so without a lock B reads ATP without A's
// allocations and returns no warning. Confirms of different SKUs still run
// side by side.
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { DB, makeBrewery, makeStaffCtx, priceSku, seedCatalog, seedCustomer, seedLocation } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

const clients: Client[] = [];

afterEach(async () => {
  await Promise.allSettled(clients.splice(0).map(async (client) => {
    await client.query("rollback").catch(() => {});
    await client.end();
  }));
});

async function staffTx(userId: string) {
  const value = new Client({ connectionString: DB });
  clients.push(value);
  await value.connect();
  await value.query("set statement_timeout='8s'; set lock_timeout='7s'");
  await value.query("begin");
  await value.query("select set_config('request.jwt.claim.sub',$1,true)", [userId]);
  await value.query("set local role authenticated");
  return value;
}

async function plain() {
  const value = new Client({ connectionString: DB });
  clients.push(value);
  await value.connect();
  return value;
}

type Warning = { sku_id: string; atp: number };
const confirmSql = "select public.confirm_order($1,$2) result";

// Two submitted orders of 6 each, against 10 on hand per SKU: the first
// order is for skus[0], the second for skus[1] (the same SKU when sameSku).
async function twoSubmittedOrders(sameSku: boolean) {
  const b = await makeBrewery();
  const ctx = await makeStaffCtx(b.id, "admin");
  const wh = await seedLocation(b.id);
  const { customerId, shipToId, saleChannelId } = await seedCustomer(b.id);
  const skus: string[] = [];
  for (const product of sameSku ? ["IPA"] : ["IPA", "Lager"]) {
    const { skuId, brandId, formatId } = await seedCatalog(b.id, { product, sku: `${product} case` });
    await priceSku(b.id, { saleChannelId, brandId, formatId, cents: 3600 });
    await runCommand("record_movement", { skuId, locationId: wh.id, binId: wh.binId, qty: 10, type: "opening_balance" }, ctx);
    skus.push(skuId);
  }
  if (sameSku) skus.push(skus[0]);
  const orderIds: string[] = [];
  for (const skuId of skus) {
    const { order_id } = await runCommand("create_order", {
      kind: "wholesale", customerId, shipToId, fromLocationId: wh.id, lines: [{ skuId, qty: 6 }],
    }, ctx) as { order_id: string };
    await runCommand("submit_order", { orderId: order_id }, ctx);
    orderIds.push(order_id);
  }
  return { userId: ctx.userId, skus, orderIds };
}

// A confirms the first order and stays open; B starts confirming the second.
// Resolves once B has either finished or is waiting on a lock.
async function raceConfirms(sameSku: boolean) {
  const f = await twoSubmittedOrders(sameSku);
  const first = await staffTx(f.userId);
  const second = await staffTx(f.userId);
  const observer = await plain();
  const pid = (await second.query("select pg_backend_pid() pid")).rows[0].pid as number;
  const waitOf = async () => (await observer.query("select wait_event_type, wait_event from pg_stat_activity where pid=$1", [pid])).rows[0];

  const a = (await first.query(confirmSql, [f.orderIds[0], crypto.randomUUID()])).rows[0].result as { warnings: Warning[] };
  expect(a.warnings).toEqual([]);
  let settled = false;
  const pending = second.query(confirmSql, [f.orderIds[1], crypto.randomUUID()]).finally(() => { settled = true; });
  pending.catch(() => {});
  await expect.poll(async () => settled || (await waitOf())?.wait_event_type === "Lock", { timeout: 5000 }).toBe(true);
  return { ...f, first, second, pending, settled: () => settled, waitOf };
}

describe("order confirm under concurrency (#1035)", { concurrent: false }, () => {
  it("a second confirm of the same SKU waits for the first and warns of the oversell", async () => {
    const r = await raceConfirms(true);
    // B either finishes on ATP without A's allocation (the bug) or waits for A (the fix).
    expect(r.settled(), "the second confirm waits for the first").toBe(false);
    expect((await r.waitOf()).wait_event, "on the per-SKU advisory lock").toBe("advisory");
    await r.first.query("commit");
    const b = (await r.pending).rows[0].result as { warnings: Warning[] };
    await r.second.query("commit");

    expect(b.warnings).toEqual([{ sku_id: r.skus[0], atp: -2 }]);
  });

  it("confirms of different SKUs do not wait for each other", async () => {
    const r = await raceConfirms(false);
    expect(r.settled(), "the second confirm finished while the first is still open").toBe(true);
    const b = (await r.pending).rows[0].result as { warnings: Warning[] };
    expect(b.warnings).toEqual([]);
  });
});
