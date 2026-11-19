// tests/brewery-typesafe-key.test.ts — a brewery's TypeSafe key and its "Suggest kinds for new
// materials" switch (docs/plans/jev-suggestions.md, per-brewery key). The key is write-only:
// browsers never reach the private table or its service-only functions, only an Admin sets or
// removes it, the status read carries the last four characters at most, and the suggestion
// read returns a brewery's own key only while that brewery's switch is on.
import { beforeAll, describe, expect, it, vi } from "vitest";
import "@/lib/commands/all";
import { runCommand, type Ctx } from "@/lib/commands/registry";
import { checkTypeSafeKey } from "@/lib/suggest-material-category";
import { readBreweryTypeSafeKey, recordMaterialKindSuggestion } from "@/lib/supabase/integration-tokens";
import { admin, makeBrewery, makeStaffCtx, sql } from "./helpers";
import { rawDatabase } from "./raw-database";

// Saving a key asks TypeSafe whether it takes it; nothing leaves the process here.
vi.mock("@/lib/suggest-material-category", () => ({ checkTypeSafeKey: vi.fn(async () => "ok") }));

const KEY_A = `ts-a-${crypto.randomUUID()}-A1b2`;
const KEY_B = `ts-b-${crypto.randomUUID()}-Z9y8`;
const SERVICE_FUNCTIONS = [
  "get_brewery_typesafe_key_status(uuid,uuid)",
  "get_material_kind_suggestion_outcomes(uuid,uuid)",
  "read_brewery_typesafe_key(uuid,uuid)",
  "record_material_kind_suggestion(uuid,uuid,text,material_category,numeric)",
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
      cross join (values ('private.brewery_typesafe_keys'), ('private.material_kind_suggestions')) tables(name)
      where has_table_privilege(role, name, privilege)
      union all
      select 'no-rls:' || relname from pg_class
      where oid in ('private.brewery_typesafe_keys'::regclass, 'private.material_kind_suggestions'::regclass) and not relrowsecurity
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
    await expect(status(adminA)).resolves.toEqual({ saved: false, last4: null, enabled: false, outcomes: { asked: 0, suggested: 0, kept: 0, changed: 0 } });
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
    expect(checkTypeSafeKey).toHaveBeenLastCalledWith(KEY_A);
    const read = await status(adminA);
    expect(read).toMatchObject(saved as object);
    expect(JSON.stringify([saved, read])).not.toContain(KEY_A.slice(0, -4));
  });

  it("keeps each brewery's key its own", async () => {
    await setKey(adminB, KEY_B);
    await Promise.all([setEnabled(adminA, true), setEnabled(adminB, true)]);
    await expect(readBreweryTypeSafeKey(brewerA)).resolves.toBe(KEY_A);
    await expect(readBreweryTypeSafeKey(adminB)).resolves.toBe(KEY_B);
    // An actor of brewery A asking for brewery B's key gets nothing.
    await expect(readBreweryTypeSafeKey({ ...adminA, breweryId: adminB.breweryId })).resolves.toBeNull();
    await expect(status(adminB)).resolves.toMatchObject({ saved: true, last4: "Z9y8", enabled: true });
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

  it("saves nothing when TypeSafe refuses the key or cannot be reached, and checks no key on removal", async () => {
    const before = await status(adminB);
    vi.mocked(checkTypeSafeKey).mockResolvedValueOnce("refused");
    await expect(setKey(adminB, `ts-bad-${crypto.randomUUID()}`)).rejects.toMatchObject({ status: 400, message: expect.stringContaining("did not accept") });
    vi.mocked(checkTypeSafeKey).mockResolvedValueOnce("unreachable");
    await expect(setKey(adminB, `ts-bad-${crypto.randomUUID()}`)).rejects.toMatchObject({ status: 502, code: "upstream_unavailable" });
    await expect(status(adminB)).resolves.toEqual(before);
    await expect(readBreweryTypeSafeKey(adminB)).resolves.toBe(KEY_B);
    vi.mocked(checkTypeSafeKey).mockClear();
    await setKey(adminB, null);
    expect(checkTypeSafeKey).not.toHaveBeenCalled();
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

// Nothing stores "accepted": the outcome compares each suggested kind with the kind of the
// material later saved under that name.
describe("kind suggestion outcomes", () => {
  const material = (ctx: Ctx, name: string, category: string) =>
    runCommand("upsert_material", { name, category, baseUom: "lb", purchaseUom: "lb" }, ctx);

  it("counts asked, suggested, kept and changed for the brewery's own names", async () => {
    const tag = crypto.randomUUID().slice(0, 8);
    await recordMaterialKindSuggestion(brewerA, `Citra ${tag}`, { choice: "hop", probability: 0.97 });
    await recordMaterialKindSuggestion(brewerA, `Honey ${tag}`, { choice: "adjunct", probability: 0.93 });
    await recordMaterialKindSuggestion(brewerA, `Unsaved ${tag}`, { choice: "malt", probability: 0.91 });
    await recordMaterialKindSuggestion(warehouseA, `Mystery ${tag}`, null);
    // Asking a name again, in any case, replaces its row.
    await recordMaterialKindSuggestion(brewerA, ` citra ${tag} `, { choice: "hop", probability: 0.99 });
    await material(brewerA, `Citra ${tag}`, "hop");
    await material(brewerA, `Honey ${tag}`, "malt");
    await material(brewerA, `Mystery ${tag}`, "other");
    // A second material whose name differs only by case does not count the name twice.
    await material(brewerA, `CITRA ${tag}`, "hop");
    await expect(status(adminA)).resolves.toMatchObject({ outcomes: { asked: 4, suggested: 3, kept: 1, changed: 1 } });
    await expect(status(adminB)).resolves.toMatchObject({ outcomes: { asked: 0, suggested: 0, kept: 0, changed: 0 } });
  });

  it("leaves out names asked more than 30 days ago", async () => {
    sql(`update private.material_kind_suggestions set asked_at = now() - interval '31 days' where brewery_id = '${adminA.breweryId}' and category is null`);
    await expect(status(adminA)).resolves.toMatchObject({ outcomes: { asked: 3, suggested: 3 } });
  });

  it("records only for an actor who may add materials in that brewery", async () => {
    await expect(recordMaterialKindSuggestion({ ...brewerA, breweryId: adminB.breweryId }, "Forged", { choice: "hop", probability: 0.95 })).rejects.toThrow(/permission denied/);
    await expect(status(adminB)).resolves.toMatchObject({ outcomes: { asked: 0 } });
  });
});
