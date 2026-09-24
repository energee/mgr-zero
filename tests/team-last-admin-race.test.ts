// tests/team-last-admin-race.test.ts — issue #458: two admins demoting or
// removing each other at the same moment must not leave the brewery with no
// admin. Two connections interleave real transactions: A's write is still
// open when B's starts, so without a lock both count two admins and commit.
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { DB, makeBrewery, makeStaffCtx } from "./helpers";

const clients: Client[] = [];

afterEach(async () => {
  await Promise.allSettled(clients.splice(0).map(async (client) => {
    await client.query("rollback").catch(() => {});
    await client.end();
  }));
});

async function adminTx(userId: string) {
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
  const c = new Client({ connectionString: DB });
  clients.push(c);
  await c.connect();
  return c;
}

async function admins(breweryId: string) {
  const c = await plain();
  return Number((await c.query("select count(*) n from public.brewery_users where brewery_id=$1 and role='admin'", [breweryId])).rows[0].n);
}

type Write = (c: Client, brewery: string, target: string) => Promise<unknown>;
const demote: Write = (c, brewery, target) =>
  c.query("select public.update_staff_role($1,$2,'sales',$3)", [brewery, target, crypto.randomUUID()]);
const remove: Write = (c, brewery, target) =>
  c.query("select public.revoke_staff($1,$2,$3)", [brewery, target, crypto.randomUUID()]);

async function race(first: Write, second: Write) {
  const brewery = (await makeBrewery()).id;
  const a = await makeStaffCtx(brewery, "admin");
  const b = await makeStaffCtx(brewery, "admin");
  const ca = await adminTx(a.userId);
  const cb = await adminTx(b.userId);
  const observer = await plain(); // outside any transaction, so pg_stat_activity is fresh
  const pid = (await cb.query("select pg_backend_pid() pid")).rows[0].pid as number;

  await first(ca, brewery, b.userId); // A's write succeeds; its transaction stays open
  let settled = false;
  const pending = second(cb, brewery, a.userId).then(
    () => ({ ok: true as const }),
    (error: Error) => ({ ok: false as const, error }),
  ).finally(() => { settled = true; });
  // B either finishes (the bug) or waits on A's lock (the fix) — then A commits.
  await expect.poll(async () => settled
    || (await observer.query("select wait_event_type from pg_stat_activity where pid=$1", [pid])).rows[0]?.wait_event_type === "Lock",
  { timeout: 5000 }).toBe(true);
  await ca.query("commit");
  const outcome = await pending;
  await cb.query(outcome.ok ? "commit" : "rollback");

  expect(await admins(brewery)).toBe(1);
  expect(outcome.ok).toBe(false);
  if (!outcome.ok) expect(outcome.error.message).toMatch(/keep at least one admin/);
}

describe.sequential("last admin under concurrency (#458)", () => {
  it("two admins demoting each other leave one admin", async () => {
    await race(demote, demote);
  });

  it("two admins removing each other leave one admin", async () => {
    await race(remove, remove);
  });
});
