// tests/transfer-pick-lock.test.ts — issue #1033: record_stock_transfer_pick
// checks the source bin under the ledger lock, as receipt and bin moves do.
// Two connections interleave real transactions: a bin move takes the stock
// out and stays open while the pick runs. Without the lock the pick reads the
// committed ledger, passes, and leaves a transfer receipt must refuse.
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { DB, admin, makeBrewery, makeStaffCtx, seedCatalog, seedLocation } from "./helpers";
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

describe("transfer pick under concurrency (#1033)", { concurrent: false }, () => {
  it("a pick waits for an open bin move out of its source bin, then refuses the stock that left", async () => {
    const b = await makeBrewery();
    const ctx = await makeStaffCtx(b.id, "warehouse");
    const from = await seedLocation(b.id, { name: "WH", uses: ["warehouse"] });
    const to = await seedLocation(b.id, { name: "Taproom", uses: ["taproom"] });
    const { data: bins } = await admin.from("bins").select("id").eq("location_id", from.id).neq("id", from.binId).limit(1);
    const { skuId } = await seedCatalog(b.id);
    await runCommand("record_movement", { skuId, locationId: from.id, binId: from.binId, qty: 5, type: "opening_balance" }, ctx);
    const { transferId } = await runCommand("create_stock_transfer", {
      fromLocationId: from.id, toLocationId: to.id, lines: [{ skuId, qty: 5, fromBinId: from.binId, toBinId: to.binId }],
    }, ctx) as { transferId: string };
    const { data: line } = await admin.from("stock_transfer_lines").select("id").eq("transfer_id", transferId).single();

    const mover = await staffTx(ctx.userId);
    const picker = await staffTx(ctx.userId);
    const observer = await plain();
    const pid = (await picker.query("select pg_backend_pid() pid")).rows[0].pid as number;

    // The move takes all 5 out of the source bin; its transaction stays open.
    await mover.query("select public.move_stock_bin($1,$2,null,null,null,5,$3,$4,null,$5)",
      [b.id, skuId, from.binId, bins![0].id, crypto.randomUUID()]);
    let settled = false;
    const pending = picker.query("select public.record_stock_transfer_pick($1,$2::jsonb,$3)",
      [transferId, JSON.stringify([{ line_id: line!.id, qty: 5 }]), crypto.randomUUID()]).then(
      () => ({ ok: true as const }),
      (error: Error) => ({ ok: false as const, error }),
    ).finally(() => { settled = true; });
    // The pick either finishes on the stale ledger (the bug) or waits on the move's lock (the fix).
    await expect.poll(async () => settled
      || (await observer.query("select wait_event_type from pg_stat_activity where pid=$1", [pid])).rows[0]?.wait_event_type === "Lock",
    { timeout: 5000 }).toBe(true);
    expect(settled, "the pick waits for the open bin move").toBe(false);
    await mover.query("commit");
    const outcome = await pending;
    await picker.query("rollback");

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.message).toMatch(/0 on hand in the source bin/);
    const { data: hdr } = await admin.from("stock_transfers").select("status").eq("id", transferId).single();
    expect(hdr!.status).toBe("submitted");
  });
});
