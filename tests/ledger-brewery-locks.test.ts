// tests/ledger-brewery-locks.test.ts — ledger writers serialize per brewery (#1628).
// A balance-checking writer in one brewery must not block another brewery's
// writer, and must still block a plain write in its own brewery.
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { runCommand, type Ctx } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { DB, makeBrewery, makeStaffCtx, seedCatalog, seedLocation } from "./helpers";

type Stock = { breweryId: string; ctx: Ctx; skuId: string; locationId: string; binId: string };

async function stocked(name: string): Promise<Stock> {
  const breweryId = (await makeBrewery()).id;
  const ctx = await makeStaffCtx(breweryId, "admin");
  const { skuId } = await seedCatalog(breweryId, { product: `${name} IPA`, sku: `${name} IPA case`, bblPerUnit: 0.25 });
  const { id: locationId, binId } = await seedLocation(breweryId, { name: `${name} warehouse` });
  await runCommand("record_movement", { skuId, locationId, binId, qty: 5, type: "opening_balance" }, ctx);
  return { breweryId, ctx, skuId, locationId, binId };
}

/** A connection acting as the stock's staff user, inside an open transaction. */
async function staffSession(s: Stock) {
  const c = new Client({ connectionString: DB });
  await c.connect();
  await c.query("set lock_timeout='3s'; set statement_timeout='5s'");
  await c.query("begin");
  await c.query("select set_config('request.jwt.claim.sub',$1,true)", [s.ctx.userId]);
  await c.query("set local role authenticated");
  return c;
}

/** record_inventory_movement; a negative qty takes the balance-check lock. */
const move = (c: Client, s: Stock, qty: number) => c.query(
  "select public.record_inventory_movement($1,$2,$3,$4,$5,'adjustment',null,null,'lock test',$6)",
  [s.breweryId, s.skuId, s.locationId, s.binId, qty, randomUUID()],
);

describe("ledger locks are per brewery", () => {
  let a: Stock, b: Stock;
  beforeAll(async () => { [a, b] = await Promise.all([stocked("Alder"), stocked("Birch")]); });

  it("does not make another brewery's balance-checked write wait", async () => {
    const holder = await staffSession(a), other = await staffSession(b);
    try {
      await move(holder, a, -1); // holds brewery A's ledger lock until rollback
      await expect(move(other, b, -1)).resolves.toBeTruthy();
    } finally {
      await Promise.all([holder, other].map(async c => { await c.query("rollback").catch(() => {}); await c.end(); }));
    }
  });

  it("still makes a plain write in the same brewery wait for the balance check", async () => {
    const holder = await staffSession(a), writer = await staffSession(a);
    // authenticated cannot see another session's wait state, so a superuser watches.
    const observer = new Client({ connectionString: DB });
    await observer.connect();
    try {
      await move(holder, a, -1);
      const pid = (await writer.query("select pg_backend_pid() pid")).rows[0].pid;
      const writing = move(writer, a, 1); // positive: no explicit lock, only the row trigger
      writing.catch(() => {});
      await expect.poll(async () => (await observer.query("select wait_event_type from pg_stat_activity where pid=$1", [pid])).rows[0]?.wait_event_type, { timeout: 2000 }).toBe("Lock");
      await holder.query("rollback");
      await expect(writing).resolves.toBeTruthy();
    } finally {
      await Promise.all([holder, writer].map(async c => { await c.query("rollback").catch(() => {}); await c.end(); }));
      await observer.end();
    }
  });

  it("waits behind a NOWAIT table locker without deadlocking its inserts", async () => {
    // The table locker stands in for private.lock_tables_or_busy (packaging close,
    // material counts): it holds SHARE ROW EXCLUSIVE, then writes ledger rows.
    const tableLocker = await staffSession(a), writer = await staffSession(a);
    const observer = new Client({ connectionString: DB });
    await observer.connect();
    try {
      // Staff cannot lock a table, so the superuser takes it and hands back.
      await tableLocker.query("reset role; lock table public.inventory_movements in share row exclusive mode; set local role authenticated");
      const pid = (await writer.query("select pg_backend_pid() pid")).rows[0].pid;
      const writing = move(writer, a, -1);
      writing.catch(() => {});
      await expect.poll(async () => (await observer.query("select wait_event_type from pg_stat_activity where pid=$1", [pid])).rows[0]?.wait_event_type, { timeout: 2000 }).toBe("Lock");
      await expect(move(tableLocker, a, 1)).resolves.toBeTruthy();
      await tableLocker.query("commit");
      await expect(writing).resolves.toBeTruthy();
    } finally {
      await Promise.all([tableLocker, writer].map(async c => { await c.query("rollback").catch(() => {}); await c.end(); }));
      await observer.end();
    }
  });
});
