// tests/brewery-typesafe-key.test.ts — a brewery's TypeSafe key and its "Suggest kinds for new
// materials" switch (docs/plans/jev-suggestions.md, per-brewery key). The key is write-only:
// browsers never reach the private table or its service-only functions, only an Admin sets or
// removes it, the status read carries the last four characters at most, and the suggestion
// read returns a brewery's own key only while that brewery's switch is on.
import { beforeAll, describe, expect, it } from "vitest";
import "@/lib/commands/all";
import { runCommand, type Ctx } from "@/lib/commands/registry";
import { readBreweryTypeSafeKey } from "@/lib/supabase/integration-tokens";
import { admin, makeBrewery, makeStaffCtx, sql } from "./helpers";
import { rawDatabase } from "./raw-database";

const KEY_A = `ts-a-${crypto.randomUUID()}-A1b2`;
const KEY_B = `ts-b-${crypto.randomUUID()}-Z9y8`;
const SERVICE_FUNCTIONS = [
  "get_brewery_typesafe_key_status(uuid,uuid)",
  "read_brewery_typesafe_key(uuid,uuid)",
  "set_brewery_typesafe_key(uuid,uuid,text,uuid)",
];

let adminA: Ctx;
let brewerA: Ctx;
let warehouseA: Ctx;
let adminB: Ctx;

const status = (ctx: Ctx) => runCommand("get_brewery_suggestion_settings", {}, ctx);
const setKey = (ctx: Ctx, apiKey: string | null) => runCommand("set_brewery_typesafe_key", { apiKey }, ctx);
const setEnabled = (ctx: Ctx, enabled: boolean) => runCommand("set_brewery_suggestions_enabled", { enabled }, ctx);

beforeAll(async () => {
  const [a, b] = await Promise.all([makeBrewery(), makeBrewery()]);
  [adminA, brewerA, warehouseA, adminB] = await Promise.all([
    makeStaffCtx(a.id, "admin"), makeStaffCtx(a.id, "brewer"), makeStaffCtx(a.id, "warehouse"), makeStaffCtx(b.id, "admin"),
  ]);
});

describe("TypeSafe key storage", () => {
  it("keeps the private table and the key functions from every browser role", async () => {
    expect(sql(`
      select 'table:' || role || ':' || privilege
      from (values ('anon'::name), ('authenticated'::name), ('service_role'::name)) roles(role)
      cross join (values ('select'), ('insert'), ('update'), ('delete'), ('truncate'), ('references'), ('trigger')) privileges(privilege)
      where has_table_privilege(role, 'private.brewery_typesafe_keys', privilege)
      union all
      select 'no-rls' where not (select relrowsecurity from pg_class where oid = 'private.brewery_typesafe_keys'::regclass)
      union all
      select 'execute:' || role || ':' || p.oid::regprocedure::text
      from pg_proc p cross join (values ('anon'::name), ('authenticated'::name), ('service_role'::name)) roles(role)
      where p.pronamespace = 'public'::regnamespace
        and p.oid::regprocedure::text in (${SERVICE_FUNCTIONS.map(f => `'${f}'`).join(", ")})
        and has_function_privilege(role, p.oid, 'execute')
      order by 1
    `)).toEqual(SERVICE_FUNCTIONS.map(f => `execute:service_role:${f}`));

    const { error: relationError } = await rawDatabase(adminA.db).schema("private").from("brewery_typesafe_keys").select("api_key");
    const { error: readError } = await rawDatabase(adminA.db).rpc("read_brewery_typesafe_key", { p_brewery: adminA.breweryId, p_actor: adminA.userId });
    expect(relationError).not.toBeNull();
    expect(readError).not.toBeNull();
  });

  it("starts unsaved and off", async () => {
    await expect(status(adminA)).resolves.toEqual({ saved: false, last4: null, enabled: false });
  });

  it("refuses to turn suggestions on before a key is saved", async () => {
    await expect(setEnabled(adminA, true)).rejects.toMatchObject({ status: 400, message: "Save a TypeSafe key first." });
    await expect(status(adminA)).resolves.toMatchObject({ enabled: false });
  });

  it("lets only an Admin set the key or flip the switch", async () => {
    for (const ctx of [brewerA, warehouseA]) {
      await expect(setKey(ctx, KEY_A)).rejects.toMatchObject({ status: 403 });
      await expect(setEnabled(ctx, true)).rejects.toMatchObject({ status: 403 });
      await expect(status(ctx)).rejects.toMatchObject({ status: 403 });
    }
    // The service-only function rechecks the actor itself, so a forged actor gets nothing.
    const { error } = await admin.rpc("set_brewery_typesafe_key", {
      p_brewery: adminA.breweryId, p_actor: brewerA.userId, p_api_key: KEY_A, p_request_id: crypto.randomUUID(),
    });
    expect(error?.code).toBe("42501");
    expect(sql(`select count(*) from private.brewery_typesafe_keys where brewery_id = '${adminA.breweryId}'`)).toEqual(["0"]);
  });

  it("saves the key and answers with its last four characters only", async () => {
    const saved = await setKey(adminA, KEY_A);
    expect(saved).toEqual({ saved: true, last4: "A1b2", enabled: false });
    const read = await status(adminA);
    expect(read).toEqual(saved);
    expect(JSON.stringify([saved, read])).not.toContain(KEY_A.slice(0, -4));
  });

  it("keeps each brewery's key its own", async () => {
    await setKey(adminB, KEY_B);
    await Promise.all([setEnabled(adminA, true), setEnabled(adminB, true)]);
    await expect(readBreweryTypeSafeKey(brewerA)).resolves.toBe(KEY_A);
    await expect(readBreweryTypeSafeKey(adminB)).resolves.toBe(KEY_B);
    // An actor of brewery A asking for brewery B's key gets nothing.
    await expect(readBreweryTypeSafeKey({ ...adminA, breweryId: adminB.breweryId })).resolves.toBeNull();
    await expect(status(adminB)).resolves.toEqual({ saved: true, last4: "Z9y8", enabled: true });
  });

  it("returns no key while the brewery's switch is off", async () => {
    await setEnabled(adminA, false);
    await expect(readBreweryTypeSafeKey(brewerA)).resolves.toBeNull();
    await setEnabled(adminA, true);
    await expect(readBreweryTypeSafeKey(brewerA)).resolves.toBe(KEY_A);
  });

  it("replaces and removes the key", async () => {
    const replacement = `ts-a2-${crypto.randomUUID()}-Q7r6`;
    await expect(setKey(adminA, replacement)).resolves.toEqual({ saved: true, last4: "Q7r6", enabled: true });
    await expect(readBreweryTypeSafeKey(brewerA)).resolves.toBe(replacement);
    // Removing the key turns suggestions off in the same transaction.
    await expect(setKey(adminA, null)).resolves.toEqual({ saved: false, last4: null, enabled: false });
    await expect(readBreweryTypeSafeKey(brewerA)).resolves.toBeNull();
    await expect(status(adminB)).resolves.toMatchObject({ saved: true, last4: "Z9y8" });
  });

  // claim_command_request_for stores sha256(payload::text). The payload names only whether a key
  // was sent, so the stored hash is one of two constants and never derives from a key.
  it("keeps the key out of the stored request hash", () => {
    expect(sql(`
      select count(*) filter (where payload_hash not in (
          extensions.digest(jsonb_build_object('apiKey', true)::text, 'sha256'),
          extensions.digest(jsonb_build_object('apiKey', false)::text, 'sha256'))),
        count(*) filter (where payload_hash = extensions.digest(jsonb_build_object('apiKey', '${KEY_A}')::text, 'sha256')),
        count(*)
      from private.command_requests
      where command_name = 'set_brewery_typesafe_key' and brewery_id = '${adminA.breweryId}'
    `)).toEqual(["0|0|3"]);
  });
});
