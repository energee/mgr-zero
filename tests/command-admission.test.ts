import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { admin, asUser, makeBrewery, makeStaff, sql } from "./helpers";

type Decision = { allowed: boolean; retry_after: number };
async function consume(db: Awaited<ReturnType<typeof asUser>>) {
  const { data, error } = await db.rpc("consume_command_admission");
  if (error) throw error;
  return (data as Decision[])[0];
}

describe("authenticated command admission", () => {
  it("atomically admits only the remaining same-user slot", async () => {
    const brewery = await makeBrewery();
    const user = await makeStaff(brewery.id);
    const db = await asUser(user.email);
    await consume(db);
    sql(`update private.command_admissions set request_count=119 where user_id='${user.id}'`);
    const results = await Promise.all([consume(db), consume(db)]);
    expect(results.filter(x => x.allowed)).toHaveLength(1);
    expect(results.filter(x => !x.allowed)).toHaveLength(1);
    expect(results.find(x => !x.allowed)?.retry_after).toBeGreaterThan(0);
  });

  it("resets an expired window and keeps another user independent", async () => {
    const brewery = await makeBrewery();
    const first = await makeStaff(brewery.id);
    const second = await makeStaff(brewery.id);
    const a = await asUser(first.email); const b = await asUser(second.email);
    await consume(a);
    sql(`update private.command_admissions set request_count=999, window_started_at=now()-interval '61 seconds' where user_id='${first.id}'`);
    await expect(consume(a)).resolves.toEqual({ allowed: true, retry_after: 0 });
    await expect(consume(b)).resolves.toEqual({ allowed: true, retry_after: 0 });
    expect(sql(`select count(*) from private.command_admissions where user_id in ('${first.id}','${second.id}')`)).toEqual(["2"]);
  });

  it("denies unauthenticated calls and exposes no private rows", async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    expect((await anon.rpc("consume_command_admission")).error?.code).toBe("42501");
    expect((await anon.from("command_admissions").select("*")).error).not.toBeNull();
    expect((await admin.from("command_admissions").select("*")).error).not.toBeNull();
    expect(sql(`select role from (values ('anon'),('authenticated'),('service_role')) r(role)
      where has_table_privilege(role,'private.command_admissions','select,insert,update,delete') order by role`)).toEqual([]);
    expect(sql(`select pg_get_constraintdef(oid) from pg_constraint
      where conrelid='private.command_admissions'::regclass and contype='f'`)).toEqual([
      "FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE",
    ]);
  });
});
