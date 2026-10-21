// tests/team-last-admin-race.test.ts — issue #458: two admins demoting or
// removing each other at the same moment must not leave the brewery with no
// admin. Two connections interleave real transactions: A's write is still
// open when B's starts, so without a lock both count two admins and commit.
import { afterEach, describe, expect, it } from "vitest";
import type { Client } from "pg";
import type { StaffRole } from "@/lib/commands/registry";
import { closePgSessions, makeBrewery, makeStaffCtx, pgSession, staffSession } from "./helpers";

afterEach(closePgSessions);

async function admins(breweryId: string) {
  const c = await pgSession();
  return Number((await c.query("select count(*) n from public.brewery_users where brewery_id=$1 and 'admin'=any(roles)", [breweryId])).rows[0].n);
}

type Write = (c: Client, brewery: string, target: string) => Promise<unknown>;
const demote: Write = (c, brewery, target) =>
  c.query("select public.update_staff_role($1,$2,array['sales']::public.staff_role[],$3)", [brewery, target, crypto.randomUUID()]);
const remove: Write = (c, brewery, target) =>
  c.query("select public.revoke_staff($1,$2,$3)", [brewery, target, crypto.randomUUID()]);

async function race(first: Write, second: Write, roles: StaffRole[] = ["admin"]) {
  const brewery = (await makeBrewery()).id;
  const a = await makeStaffCtx(brewery, roles);
  const b = await makeStaffCtx(brewery, roles);
  const ca = await staffSession(a.userId);
  const cb = await staffSession(b.userId);
  const observer = await pgSession(); // outside any transaction, so pg_stat_activity is fresh
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
  expect(settled, "the second admin mutation waits for the first transaction").toBe(false);
  await ca.query("commit");
  const outcome = await pending;
  await cb.query(outcome.ok ? "commit" : "rollback");

  expect(await admins(brewery)).toBe(1);
  expect(outcome.ok).toBe(false);
  if (!outcome.ok) expect(outcome.error.message).toMatch(/keep at least one admin/);
}

describe("last admin under concurrency (#458)", { concurrent: false }, () => {
  it("two admins demoting each other leave one admin", async () => {
    await race(demote, demote);
  });

  it("two admins removing each other leave one admin", async () => {
    await race(remove, remove);
  });

  it("the last admin+sales member cannot remove admin from their roles", async () => {
    const brewery = (await makeBrewery()).id;
    const staff = await makeStaffCtx(brewery, ["admin", "sales"]);
    const c = await staffSession(staff.userId);
    await expect(demote(c, brewery, staff.userId)).rejects.toThrow(/keep at least one admin/);
    await c.query("rollback");
    expect(await admins(brewery)).toBe(1);
    const observer = await pgSession();
    expect((await observer.query("select roles::text[] roles from public.brewery_users where brewery_id=$1 and user_id=$2", [brewery, staff.userId])).rows)
      .toEqual([{ roles: ["admin", "sales"] }]);
  });

  it("an admin+sales member still cannot revoke their own membership", async () => {
    const brewery = (await makeBrewery()).id;
    const staff = await makeStaffCtx(brewery, ["admin", "sales"]);
    const c = await staffSession(staff.userId);
    await expect(remove(c, brewery, staff.userId)).rejects.toThrow(/you cannot remove yourself/);
    await c.query("rollback");
    expect(await admins(brewery)).toBe(1);
  });

  for (const [name, first, second] of [
    ["demotion / demotion", demote, demote],
    ["revocation / revocation", remove, remove],
    ["demotion / revocation", demote, remove],
    ["revocation / demotion", remove, demote],
  ] as const) {
    it(`serializes admin+sales ${name}, retaining one admin membership`, async () => {
      await race(first, second, ["admin", "sales"]);
    });
  }
});
