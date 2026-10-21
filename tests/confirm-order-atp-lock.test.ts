// tests/confirm-order-atp-lock.test.ts — issues #1035 and #1070: an
// allocation written at the same moment as an order confirm must not be
// missed by the confirm's oversell warning. Two connections interleave real
// transactions: A's write (a confirm, a line raise, or a standing allocation)
// is still open when B's confirm starts, so without the per-SKU `atp:` lock B
// reads ATP without A's allocation and returns no warning. Writes for
// different SKUs still run side by side, and every writer takes its locks in
// SKU order so none can deadlock another.
import { afterEach, describe, expect, it } from "vitest";
import { closePgSessions, makeBrewery, makeStaffCtx, priceSku, seedCatalog, seedCustomer, seedLocation, staffSession, pgSession } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

afterEach(closePgSessions);

type Warning = { sku_id: string; atp: number };
type Stock = Awaited<ReturnType<typeof stockedSkus>>;
const confirmSql = "select public.confirm_order($1,$2) result";
const adjustSql = "select public.adjust_order_lines($1,$2,'raise',$3) result";
const standingSql = "select public.set_standing_allocation($1,$2,$3,$4) result";
const lines = (...ls: [string, number][]) => JSON.stringify(ls.map(([sku_id, qty]) => ({ sku_id, qty })));

// Two SKUs with 10 on hand each at a warehouse, plus a taproom and a
// wholesale customer. skus is sorted, so skus[0] is the one locked first.
async function stockedSkus() {
  const b = await makeBrewery();
  const ctx = await makeStaffCtx(b.id, "admin");
  const wh = await seedLocation(b.id);
  const taproom = await seedLocation(b.id, { name: "Taproom", uses: ["taproom"] });
  const { customerId, shipToId, saleChannelId } = await seedCustomer(b.id);
  const skus: string[] = [];
  for (const product of ["IPA", "Lager"]) {
    const { skuId, brandId, formatId } = await seedCatalog(b.id, { product, sku: `${product} case` });
    await priceSku(b.id, { saleChannelId, brandId, formatId, cents: 3600 });
    await runCommand("record_movement", { skuId, locationId: wh.id, binId: wh.binId, qty: 10, type: "opening_balance" }, ctx);
    skus.push(skuId);
  }
  return { ctx, userId: ctx.userId, customerId, shipToId, warehouseId: wh.id, taproomId: taproom.id, skus: skus.sort() };
}

// A submitted wholesale order, confirmed too when asked.
async function wholesaleOrder(s: Stock, ls: [string, number][], confirm = false) {
  const { order_id } = await runCommand("create_order", {
    kind: "wholesale", customerId: s.customerId, shipToId: s.shipToId, fromLocationId: s.warehouseId,
    lines: ls.map(([skuId, qty]) => ({ skuId, qty })),
  }, s.ctx) as { order_id: string };
  await runCommand("submit_order", { orderId: order_id }, s.ctx);
  if (confirm) await runCommand("confirm_order", { orderId: order_id }, s.ctx);
  return order_id;
}

// Each first write puts 6 of skus[0] on hold; it returns the SQL A runs.
const firstWrites: Record<string, (s: Stock) => Promise<[string, unknown[]]>> = {
  confirm: async (s) => [confirmSql, [await wholesaleOrder(s, [[s.skus[0], 6]])]],
  "line raise": async (s) => [adjustSql, [await wholesaleOrder(s, [[s.skus[0], 2]], true), lines([s.skus[0], 6])]],
  // A transfer has no skus freeze, so before #1070 nothing made a confirm wait for its raise.
  "transfer line raise": async (s) => {
    const { order_id } = await runCommand("create_replenishment_order", {
      fromLocationId: s.warehouseId, toLocationId: s.taproomId, lines: [{ skuId: s.skus[0], qty: 2 }],
    }, s.ctx) as { order_id: string };
    return [adjustSql, [order_id, lines([s.skus[0], 6])]];
  },
  "standing allocation": async (s) => [standingSql, [s.taproomId, s.skus[0], 6]],
};

// Watches a session from another connection: what it waits on, and which locks it holds.
async function observe(session: Awaited<ReturnType<typeof staffSession>>) {
  const observer = await pgSession();
  const pid = (await session.query("select pg_backend_pid() pid")).rows[0].pid as number;
  return {
    waitOf: async () => (await observer.query("select wait_event_type, wait_event from pg_stat_activity where pid=$1", [pid])).rows[0],
    locks: (where: string) => observer.query(`select 1 from pg_locks where pid=$1 and ${where}`, [pid]),
  };
}

// A runs the first write and stays open; B starts confirming a submitted order
// of 6 for skus[0] (sameSku) or skus[1]. Resolves once B has either finished
// or is waiting on a lock.
async function raceConfirm(first: string, sameSku: boolean) {
  const s = await stockedSkus();
  const [sql, params] = await firstWrites[first](s);
  const second = await wholesaleOrder(s, [[s.skus[sameSku ? 0 : 1], 6]]);
  const a = await staffSession(s.userId);
  const b = await staffSession(s.userId);
  const { waitOf } = await observe(b);

  await a.query(sql, [...params, crypto.randomUUID()]);
  let settled = false;
  const pending = b.query(confirmSql, [second, crypto.randomUUID()]).finally(() => { settled = true; });
  pending.catch(() => {});
  await expect.poll(async () => settled || (await waitOf())?.wait_event_type === "Lock", { timeout: 5000 }).toBe(true);
  return { ...s, first: a, second: b, pending, settled: () => settled, waitOf };
}

describe("order confirm under concurrency (#1035, #1070)", { concurrent: false }, () => {
  for (const first of Object.keys(firstWrites)) {
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
    const s = await stockedSkus();
    const [sql, params] = await firstWrites["standing allocation"](s);
    const a = await staffSession(s.userId);
    const replenish = await staffSession(s.userId);
    const { waitOf, locks } = await observe(replenish);
    await a.query(sql, [...params, crypto.randomUUID()]);

    const pending = replenish.query("select public.create_replenishment_order($1,$2,$3,$4) result",
      [s.warehouseId, s.taproomId, lines([s.skus[0], 1]), crypto.randomUUID()]);
    pending.catch(() => {});
    await expect.poll(async () => (await waitOf())?.wait_event, { timeout: 5000 }).toBe("advisory");
    const held = await locks("relation in ('public.order_lines'::regclass, 'public.skus'::regclass)");
    expect(held.rowCount, "no order line or skus row touched while waiting").toBe(0);
    await a.query("commit");
    const result = (await pending).rows[0].result as { order_id: string };
    expect(result.order_id).toEqual(expect.any(String));
  });

  // Two writers of both SKUs deadlock only if each holds a SKU the other
  // waits for. A function takes its locks inside one statement, so a test
  // cannot pause it between them. Here A is one transaction writing skus[0]
  // then skus[1] (two standing allocations), paused after the first. B raises
  // both SKUs, listed in the opposite order. Sorted, B waits on skus[0] with
  // no atp: lock held, so A's second write goes through. Unsorted, B would
  // hold skus[1] and A's second write would deadlock.
  it("a multi-SKU raise listed in reverse order takes its atp: locks in SKU order", async () => {
    const s = await stockedSkus();
    const order = await wholesaleOrder(s, [[s.skus[0], 1], [s.skus[1], 1]], true);
    const a = await staffSession(s.userId);
    const b = await staffSession(s.userId);
    const { waitOf, locks } = await observe(b);
    await a.query(standingSql, [s.taproomId, s.skus[0], 1, crypto.randomUUID()]);

    const pending = b.query(adjustSql, [order, lines([s.skus[1], 2], [s.skus[0], 2]), crypto.randomUUID()]);
    pending.catch(() => {});
    await expect.poll(async () => (await waitOf())?.wait_event, { timeout: 5000 }).toBe("advisory");
    expect((await locks("locktype = 'advisory' and granted")).rowCount, "no atp: lock held while waiting for the first").toBe(0);
    await a.query(standingSql, [s.taproomId, s.skus[1], 1, crypto.randomUUID()]);
    await a.query("commit");
    const result = (await pending).rows[0].result as { order_id: string };
    expect(result.order_id).toBe(order);
  });
});
