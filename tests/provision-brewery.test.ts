import type { Database } from "@/lib/supabase/database";
import { beforeAll, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { admin, asUser, sql } from "./helpers";
const request = vi.hoisted(() => ({ db: undefined as SupabaseClient<Database> | undefined, dedicated: false }));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => request.db }));
vi.mock("@/lib/env/server", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/env/server")>();
  return { ...actual, getServerEnv: () => ({ ...actual.getServerEnv(), dedicated: request.dedicated }) };
});
import { buildContext, buildContextFromBearer } from "@/lib/commands/context";
import { canRun, defineQuery, runCommand } from "@/lib/commands/registry";
import { POST } from "@/app/api/command/route";
let token: string;
let userId: string;
const input = { name: `Provision ${crypto.randomUUID()}`, timezone: "America/New_York", ttb: null };
const requestId = crypto.randomUUID();
let breweryId: string;
/** Calls the RPC by name with arbitrary arguments, bypassing the generated signature types. */
function directRpc(db: SupabaseClient<Database>, args: Record<string, unknown>) {
  return (db.rpc as unknown as (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string } | null }>)("provision_brewery", args);
}
function post(body: object, bearer = token) {
  return POST(new Request("http://localhost/api/command", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` }, body: JSON.stringify(body) }));
}
beforeAll(async () => {
  const email = `${crypto.randomUUID()}@test.local`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "test-password-1", email_confirm: true });
  if (error) throw error;
  userId = data.user!.id;
  request.db = await asUser(email);
  token = (await request.db.auth.getSession()).data.session!.access_token;
});
it("provisions without membership via Bearer and replays concurrently without duplicate breweries", async () => {
  const body = { name: "provision_brewery", input, requestId };
  const responses = await Promise.all([post(body), post(body)]);
  expect(responses.map(r => r.status)).toEqual([200, 200]);
  const results = await Promise.all(responses.map(r => r.json()));
  expect(results[0].data).toEqual(results[1].data);
  breweryId = results[0].data;
  expect((await admin.from("brewery_users").select("role").eq("brewery_id", breweryId).eq("user_id", userId)).data).toEqual([{ role: "admin" }]);
  expect((await admin.from("breweries").select("id").eq("name", input.name)).data).toEqual([{ id: breweryId }]);
  expect((await post({ ...body, input: { ...input, name: "different" } })).status).toBe(409);
});
it("cookie identity builds a typed pre-tenant context and can provision through the cookie route", async () => {
  const ctx = await buildContext();
  expect(ctx).toMatchObject({ userId, breweryId: null, role: null });
  const response = await POST(new Request("http://localhost/api/command", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "provision_brewery", input, requestId }) }));
  expect(response.status).toBe(200);
  expect((await response.json()).data).toBe(breweryId);
});
it("denies every tenant operation even roles:any and isolates request identities across commands", async () => {
  const ctx = await buildContextFromBearer(undefined, token);
  defineQuery({ name: "provision_test_any", roles: "any", input: z.object({}), handler: async () => "unsafe" });
  expect(canRun(ctx, "provision_test_any")).toBe(false);
  await expect(runCommand("provision_test_any", {}, ctx)).rejects.toMatchObject({ status: 403 });
  await expect(runCommand("list_brands", {}, ctx)).rejects.toMatchObject({ status: 403 });
  expect((await post({ name: "list_brands", input: {} })).status).toBe(400);
  expect((await post({ breweryId, name: "upsert_brand", input: { name: "Collision" }, requestId })).status).toBe(409);
  const tenantRequest = crypto.randomUUID();
  expect((await post({ breweryId, name: "upsert_brand", input: { name: "Existing" }, requestId: tenantRequest })).status).toBe(200);
  expect((await post({ name: "provision_brewery", input, requestId: tenantRequest })).status).toBe(409);
});
it("validates at the RPC boundary and unauthenticated requests cannot bootstrap", async () => {
  const name = `Invalid ${crypto.randomUUID()}`;
  const badRequest = crypto.randomUUID();
  const bad = await admin.rpc("provision_brewery", { p_actor: userId, p_name: name, p_timezone: "Not/AZone", p_ttb: null, p_request_id: badRequest });
  expect(bad.error?.code).toBe("P0001");
  expect((await admin.from("breweries").select("id").eq("name", name)).data).toEqual([]);
  expect((await post({ name: "provision_brewery", input, requestId: badRequest }, "invalid")).status).toBe(401);
  expect((await post({ name: "provision_brewery", input: { ...input, name: " " }, requestId: badRequest })).status).toBe(400);
  expect((await post({ name: "provision_brewery", input: { ...input, name }, requestId: badRequest })).status).toBe(200);
});
it("keeps existing and anonymous roles from using bootstrap as an elevation path", async () => {
  const tenant = await buildContextFromBearer(breweryId, token);
  expect(canRun(tenant, "provision_brewery")).toBe(false);
  await expect(runCommand("provision_brewery", input, tenant)).rejects.toMatchObject({ status: 403 });
  expect((await post({ breweryId, name: "provision_brewery", input, requestId })).status).toBe(400);
  expect((await directRpc(admin, { p_actor: null, p_name: "Service bypass", p_timezone: "UTC", p_ttb: null, p_request_id: crypto.randomUUID() })).error?.code).toBe("42501");
  expect((await admin.rpc("provision_brewery", { p_actor: crypto.randomUUID(), p_name: "Unknown actor", p_timezone: "UTC", p_ttb: null, p_request_id: crypto.randomUUID() })).error?.code).toBe("42501");
  const email = `${crypto.randomUUID()}@test.local`;
  const created = await admin.auth.admin.createUser({ email, password: "test-password-1", email_confirm: true });
  expect(created.error).toBeNull();
  const other = await asUser(email);
  expect((await other.from("breweries").select("id").eq("id", breweryId)).data).toEqual([]);
  const otherCtx = await buildContextFromBearer(undefined, (await other.auth.getSession()).data.session!.access_token);
  const independent = await runCommand("provision_brewery", { name: "Other actor", timezone: "UTC", ttb: null }, otherCtx, { requestId, correlationId: requestId });
  expect(independent).not.toBe(breweryId);
  await admin.from("brewery_users").delete().eq("brewery_id", breweryId).eq("user_id", userId);
  expect((await post({ name: "provision_brewery", input, requestId })).status).toBe(200);
  expect((await admin.from("brewery_users").select("role").eq("brewery_id", breweryId).eq("user_id", userId)).data).toEqual([]);
});

it("rolls back brewery and request when the dependent admin insert fails", async () => {
  const name = `Atomic ${crypto.randomUUID()}`;
  const id = crypto.randomUUID();
  sql(`create function private.provision_test_failure() returns trigger language plpgsql as $$
    begin raise exception 'forced membership failure'; end $$;
    create trigger provision_test_failure before insert on public.brewery_users
    for each row when (new.user_id = '${userId}') execute function private.provision_test_failure();`);
  try {
    const result = await admin.rpc("provision_brewery", { p_actor: userId, p_name: name, p_timezone: "UTC", p_ttb: null, p_request_id: id });
    expect(result.error?.message).toBe("forced membership failure");
    expect((await admin.from("breweries").select("id").eq("name", name)).data).toEqual([]);
    expect(sql(`select count(*) from private.command_requests where actor_id = '${userId}' and request_id = '${id}'`)).toEqual(["0"]);
  } finally {
    sql("drop trigger provision_test_failure on public.brewery_users; drop function private.provision_test_failure();");
  }
  expect((await admin.rpc("provision_brewery", { p_actor: userId, p_name: name, p_timezone: "UTC", p_ttb: null, p_request_id: id })).error).toBeNull();
});

it("a signed-in user cannot provision a brewery by calling the RPC directly (#467)", async () => {
  const name = `Direct ${crypto.randomUUID()}`;
  const legacy = await directRpc(request.db!, { p_name: name, p_timezone: "UTC", p_ttb: null, p_request_id: crypto.randomUUID() });
  expect(legacy.error).not.toBeNull();
  const asActor = await directRpc(request.db!, { p_actor: userId, p_name: name, p_timezone: "UTC", p_ttb: null, p_request_id: crypto.randomUUID() });
  expect(asActor.error).not.toBeNull();
  expect((await admin.from("breweries").select("id").eq("name", name)).data).toEqual([]);
});

it("refuses provisioning through the command and API when the deployment is dedicated (#467)", async () => {
  const name = `Dedicated ${crypto.randomUUID()}`;
  const ctx = await buildContextFromBearer(undefined, token);
  request.dedicated = true;
  try {
    await expect(runCommand("provision_brewery", { ...input, name }, ctx, { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() }))
      .rejects.toMatchObject({ status: 403 });
    expect((await post({ name: "provision_brewery", input: { ...input, name }, requestId: crypto.randomUUID() })).status).toBe(403);
  } finally {
    request.dedicated = false;
  }
  expect((await admin.from("breweries").select("id").eq("name", name)).data).toEqual([]);
});
