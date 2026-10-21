// tests/confirm-order-atp-lock.test.ts — issues #1035 and #1070: an
// allocation written at the same moment as an order confirm must not be
// missed by the confirm's oversell warning. Two connections interleave real
// transactions: A's write (a confirm, a line raise, or a standing allocation)
// is still open when B's confirm starts, so without the per-SKU `atp:` lock B
// reads ATP without A's allocation and returns no warning. Writes for
// different SKUs still run side by side.
import { afterEach, describe, expect, it } from "vitest";
import { closePgSessions, makeBrewery, makeStaffCtx, priceSku, seedCatalog, seedCustomer, seedLocation, staffSession, pgSession } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

afterEach(closePgSessions);

type Warning = { sku_id: string; atp: number };
type Fixture = Awaited<ReturnType<typeof twoOrders>>;
const confirmSql = "select public.confirm_order($1,$2) result";

// Two wholesale orders against 10 on hand per SKU: the first is for skus[0],
// the second for skus[1] (the same SKU when sameSku). The second is submitted
// for 6; the first is submitted for 6, or confirmed for 2 when raiseFirst.
async function twoOrders(sameSku: boolean, raiseFirst = false) {
  const b = await makeBrewery();
  const ctx = await makeStaffCtx(b.id, "admin");
  const wh = await seedLocation(b.id);
  const taproom = await seedLocation(b.id, { name: "Taproom", uses: ["taproom"] });
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
  for (const [i, skuId] of skus.entries()) {
    const { order_id } = await runCommand("create_order", {
      kind: "wholesale", customerId, shipToId, fromLocationId: wh.id, lines: [{ skuId, qty: raiseFirst && i === 0 ? 2 : 6 }],
    }, ctx) as { order_id: string };
    await runCommand("submit_order", { orderId: order_id }, ctx);
    if (raiseFirst && i === 0) await runCommand("confirm_order", { orderId: order_id }, ctx);
    orderIds.push(order_id);
  }
  return { userId: ctx.userId, skus, orderIds, warehouseId: wh.id, taproomId: taproom.id };
}

// Each first write puts 6 of skus[0] on hold in A's open transaction.
const firstWrites = {
  confirm: { raiseFirst: false, sql: confirmSql, params: (f: Fixture) => [f.orderIds[0]] },
  "line raise": {
    raiseFirst: true, sql: "select public.adjust_order_lines($1,$2,'raise',$3) result",
    params: (f: Fixture) => [f.orderIds[0], JSON.stringify([{ sku_id: f.skus[0], qty: 6 }])],
  },
  "standing allocation": {
    raiseFirst: false, sql: "select public.set_standing_allocation($1,$2,6,$3) result",
    params: (f: Fixture) => [f.taproomId, f.skus[0]],
  },
};

// A runs the first write and stays open; B starts confirming the second order.
// Resolves once B has either finished or is waiting on a lock.
async function raceConfirm(first: keyof typeof firstWrites, sameSku: boolean) {
  const w = firstWrites[first];
  const f = await twoOrders(sameSku, w.raiseFirst);
  const a = await staffSession(f.userId);
  const second = await staffSession(f.userId);
  const observer = await pgSession();
  const pid = (await second.query("select pg_backend_pid() pid")).rows[0].pid as number;
  const waitOf = async () => (await observer.query("select wait_event_type, wait_event from pg_stat_activity where pid=$1", [pid])).rows[0];

  await a.query(w.sql, [...w.params(f), crypto.randomUUID()]);
  let settled = false;
  const pending = second.query(confirmSql, [f.orderIds[1], crypto.randomUUID()]).finally(() => { settled = true; });
  pending.catch(() => {});
  await expect.poll(async () => settled || (await waitOf())?.wait_event_type === "Lock", { timeout: 5000 }).toBe(true);
  return { ...f, first: a, second, pending, settled: () => settled, waitOf };
}

describe("order confirm under concurrency (#1035, #1070)", { concurrent: false }, () => {
  for (const first of Object.keys(firstWrites) as (keyof typeof firstWrites)[]) {
    it(`a confirm of the same SKU waits for a ${first} and warns of the oversell`, async () => {
      const r = await raceConfirm(first, true);
      // B either finishes on ATP without A's allocation (the bug) or waits for A (the fix).
      expect(r.settled(), `the confirm waits for the ${first}`).toBe(false);
      expect((await r.waitOf()).wait_event, "on the per-SKU advisory lock").toBe("advisory");
      await r.first.query("commit");
      const b = (await r.pending).rows[0].result as { warnings: Warning[] };
      await r.second.query("commit");

      expect(b.warnings).toEqual([{ sku_id: r.skus[0], atp: -2 }]);
    });

    it(`a confirm of a different SKU does not wait for a ${first}`, async () => {
      const r = await raceConfirm(first, false);
      expect(r.settled(), `the confirm finished while the ${first} is still open`).toBe(true);
      const b = (await r.pending).rows[0].result as { warnings: Warning[] };
      expect(b.warnings).toEqual([]);
    });
  }

  // A raise holds the atp: lock and then freezes the skus rows. A replenishment
  // that wrote its order lines (key-sharing those rows) before waiting for the
  // atp: lock would deadlock with it, so it must wait before writing anything.
  it("a replenishment waits for the atp: lock before writing its order lines", async () => {
    const f = await twoOrders(true);
    const a = await staffSession(f.userId);
    const replenish = await staffSession(f.userId);
    const observer = await pgSession();
    const pid = (await replenish.query("select pg_backend_pid() pid")).rows[0].pid as number;
    const { sql, params } = firstWrites["standing allocation"];
    await a.query(sql, [...params(f), crypto.randomUUID()]);

    const pending = replenish.query("select public.create_replenishment_order($1,$2,$3,$4) result",
      [f.warehouseId, f.taproomId, JSON.stringify([{ sku_id: f.skus[0], qty: 1 }]), crypto.randomUUID()]);
    pending.catch(() => {});
    await expect.poll(async () => (await observer.query("select wait_event from pg_stat_activity where pid=$1", [pid])).rows[0]?.wait_event, { timeout: 5000 }).toBe("advisory");
    const lineLocks = await observer.query("select 1 from pg_locks where pid=$1 and relation='public.order_lines'::regclass", [pid]);
    expect(lineLocks.rowCount, "no order line written while waiting").toBe(0);
    await a.query("commit");
    await pending;
  });
});
