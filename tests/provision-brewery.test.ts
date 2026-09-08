import { beforeAll, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { admin, asUser, sql } from "./helpers";
const request = vi.hoisted(() => ({ db: undefined as SupabaseClient | undefined }));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => request.db }));
import { buildContext, buildContextFromBearer } from "@/lib/commands/context";
import { canRun, defineQuery, runCommand } from "@/lib/commands/registry";
import { POST } from "@/app/api/command/route";
let token: string;
let userId: string;
const input = { name: `Provision ${crypto.randomUUID()}`, timezone: "America/New_York", ttb: null };
const requestId = crypto.randomUUID();
let breweryId: string;
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
  const bad = await request.db!.rpc("provision_brewery", { p_name: name, p_timezone: "Not/AZone", p_ttb: null, p_request_id: badRequest });
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
  expect((await admin.rpc("provision_brewery", { p_name: "Service bypass", p_timezone: "UTC", p_ttb: null, p_request_id: crypto.randomUUID() })).error?.code).toBe("42501");
  const email = `${crypto.randomUUID()}@test.local`;
  const created = await admin.auth.admin.createUser({ email, password: "test-password-1", email_confirm: true });
  expect(created.error).toBeNull();
  const other = await asUser(email);
  expect((await other.from("breweries").select("id").eq("id", breweryId)).data).toEqual([]);
  const independent = await other.rpc("provision_brewery", { p_name: "Other actor", p_timezone: "UTC", p_ttb: null, p_request_id: requestId });
  expect(independent.error).toBeNull();
  expect(independent.data).not.toBe(breweryId);
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
    const result = await request.db!.rpc("provision_brewery", { p_name: name, p_timezone: "UTC", p_ttb: null, p_request_id: id });
    expect(result.error?.message).toBe("forced membership failure");
    expect((await admin.from("breweries").select("id").eq("name", name)).data).toEqual([]);
    expect(sql(`select count(*) from private.command_requests where actor_id = '${userId}' and request_id = '${id}'`)).toEqual(["0"]);
  } finally {
    sql("drop trigger provision_test_failure on public.brewery_users; drop function private.provision_test_failure();");
  }
  expect((await request.db!.rpc("provision_brewery", { p_name: name, p_timezone: "UTC", p_ttb: null, p_request_id: id })).error).toBeNull();
});
