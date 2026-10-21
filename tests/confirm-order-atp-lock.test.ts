// tests/confirm-order-atp-lock.test.ts — issue #1035: two orders for the
// same SKU confirmed at the same moment must not both skip the oversell
// warning. Two connections interleave real transactions: A's confirm is
// still open when B's starts, so without a lock B reads ATP without A's
// allocations and returns no warning.
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

describe("order confirm under concurrency (#1035)", { concurrent: false }, () => {
  it("a second confirm of the same SKU waits for the first and warns of the oversell", async () => {
    const b = await makeBrewery();
    const ctx = await makeStaffCtx(b.id, "admin");
    const wh = await seedLocation(b.id);
    const { skuId, brandId, formatId } = await seedCatalog(b.id);
    const { customerId, shipToId, saleChannelId } = await seedCustomer(b.id);
    await priceSku(b.id, { saleChannelId, brandId, formatId, cents: 3600 });
    await runCommand("record_movement", { skuId, locationId: wh.id, binId: wh.binId, qty: 10, type: "opening_balance" }, ctx);
    const orderIds: string[] = [];
    for (let i = 0; i < 2; i++) {
      const { order_id } = await runCommand("create_order", {
        kind: "wholesale", customerId, shipToId, fromLocationId: wh.id, lines: [{ skuId, qty: 6 }],
      }, ctx) as { order_id: string };
      await runCommand("submit_order", { orderId: order_id }, ctx);
      orderIds.push(order_id);
    }

    const first = await staffTx(ctx.userId);
    const second = await staffTx(ctx.userId);
    const observer = await plain();
    const pid = (await second.query("select pg_backend_pid() pid")).rows[0].pid as number;

    // A allocates 6 of 10: no warning. Its transaction stays open.
    const a = (await first.query(confirmSql, [orderIds[0], crypto.randomUUID()])).rows[0].result as { warnings: Warning[] };
    expect(a.warnings).toEqual([]);
    let settled = false;
    const pending = second.query(confirmSql, [orderIds[1], crypto.randomUUID()]).finally(() => { settled = true; });
    pending.catch(() => {});
    // B either finishes on ATP without A's allocation (the bug) or waits for A (the fix).
    await expect.poll(async () => settled
      || (await observer.query("select wait_event_type from pg_stat_activity where pid=$1", [pid])).rows[0]?.wait_event_type === "Lock",
    { timeout: 5000 }).toBe(true);
    expect(settled, "the second confirm waits for the first").toBe(false);
    await first.query("commit");
    const bResult = (await pending).rows[0].result as { warnings: Warning[] };
    await second.query("commit");

    expect(bResult.warnings).toEqual([{ sku_id: skuId, atp: -2 }]);
  });
});
