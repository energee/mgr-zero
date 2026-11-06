// tests/agent-access.test.ts — an OAuth token acts as its person for reads only:
// it cannot commit, cannot change the account, cannot read a brewery with agents
// off, and stops at revoke.
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { POST } from "@/app/api/command/route";
import { createRequestAuthContext } from "@/lib/auth/request-context";
import { buildContextFromBearer } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { API, ANON, client, connectAgent } from "./agent-oauth";
import { asUser, ins, makeBrewery, makeStaff, makeStaffCtx, seedCustomer, seedLocation, sql } from "./helpers";

const updateAccount = (token: string, change: Record<string, unknown>) => fetch(`${API}/auth/v1/user`, {
  method: "PUT",
  headers: { apikey: ANON, authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify(change),
});

function call(token: string, body: Record<string, unknown>) {
  return POST(new Request("http://localhost/api/command", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  }));
}

const setAgentsEnabled = (breweryId: string, on: boolean) => sql(`update public.breweries set agents_enabled = ${on} where id = '${breweryId}'`);

describe("agent tokens", () => {
  let breweryId: string;
  let email: string;
  let agent: Awaited<ReturnType<typeof connectAgent>>;

  beforeAll(async () => {
    breweryId = (await makeBrewery()).id;
    email = (await makeStaff(breweryId, ["admin", "warehouse"])).email;
    agent = await connectAgent(email);
    setAgentsEnabled(breweryId, true);
  });

  it("resolves to the person's roles and names the client", async () => {
    const ctx = await buildContextFromBearer(breweryId, agent.token);
    expect(ctx.roles).toEqual(["admin", "warehouse"]);
    expect(ctx.agent).toEqual({ clientId: agent.clientId });
  });

  it("runs a read", async () => {
    const response = await call(agent.token, { breweryId, name: "get_today", input: {} });
    expect(response.status).toBe(200);
  });

  it("runs a read its roles allow, even one not marked for AI", async () => {
    expect((await call(agent.token, { breweryId, name: "list_invoices", input: {} })).status).toBe(200);
  });

  it("refuses a hidden read", async () => {
    const response = await call(agent.token, { breweryId, name: "get_qbo_connection", input: {} });
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("agent_not_allowed");
  });

  it("refuses a command through the API", async () => {
    const response = await call(agent.token, { breweryId, name: "record_movement", input: {}, requestId: randomUUID() });
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("agent_not_allowed");
  });

  it("cannot commit by calling an RPC directly", async () => {
    const { error } = await client(agent.token).rpc("create_chat_conversation", { p_brewery: breweryId, p_title: "Agent", p_request_id: randomUUID() });
    expect(error?.code).toBe("42501");
    expect(error?.message).toBe("agent tokens cannot commit");
  });

  it.each([
    { password: "agent-chosen-2" }, { email: "moved@test.local" }, { data: { moved: true } },
  ])("cannot change the account through Supabase Auth: %j", async (change) => {
    const response = await updateAccount(agent.token, change);
    expect(response.status).toBe(403);
    expect((await response.json()).error_code).toBe("session_not_found");
  });

  it("still cannot change the account after a token refresh, and keeps reading", async () => {
    const refreshed = await connectAgent(email).then((connected) => connected.refresh());
    expect((await updateAccount(refreshed, { password: "agent-chosen-2" })).status).toBe(403);
    expect((await client(refreshed).from("breweries").select("id").eq("id", breweryId)).data).toHaveLength(1);
  });

  it("leaves a person's own token able to reach Supabase Auth", async () => {
    const person = client();
    const { data } = await person.auth.signInWithPassword({ email, password: "test-password-1" });
    expect((await updateAccount(data.session!.access_token, { data: { checked: true } })).status).toBe(200);
  });

  it("treats a token without its session claim as revoked", () => {
    expect(sql(`select set_config('request.jwt.claims', '{"client_id":"x"}', true);
      select private.request_scope_allows('${breweryId}')`, true)).toContain("f");
  });

  it("does not count an agent token in a session cookie as signed in", async () => {
    const claims = { sub: agent.userId, client_id: agent.clientId };
    const cookieClient = { auth: { getClaims: async () => ({ data: { claims }, error: null }) } } as unknown as ReturnType<typeof client>;
    expect(await createRequestAuthContext(async () => cookieClient).getIdentity()).toBeNull();
  });

  it.each([
    ["private.command_requests", "insert into private.command_requests default values"],
    ["private.command_requests", "update private.command_requests set result = null"],
    ["private.invite_requests", "update private.invite_requests set last_error = null"],
    ["public.notification_occurrences", "insert into public.notification_occurrences default values"],
  ])("refuses a write to %s under an agent JWT", (_table, write) => {
    expect(() => sql(`select set_config('request.jwt.claims', '{"client_id":"x"}', true); ${write};`)).toThrow(/agent tokens cannot commit/);
  });

  it("reads nothing from a brewery with agents off, even straight from the REST API", async () => {
    const reader = client(agent.token);
    expect((await reader.from("breweries").select("id").eq("id", breweryId)).data).toHaveLength(1);
    setAgentsEnabled(breweryId, false);
    try {
      expect((await reader.from("breweries").select("id").eq("id", breweryId)).data).toEqual([]);
      const response = await call(agent.token, { breweryId, name: "get_today", input: {} });
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe("not_member");
    } finally {
      setAgentsEnabled(breweryId, true);
    }
  });

  it("reads no order email status from a brewery with agents off", async () => {
    const customer = await seedCustomer(breweryId);
    const { id: locationId } = await seedLocation(breweryId);
    const order = await ins("orders", { brewery_id: breweryId, kind: "wholesale", status: "submitted", customer_id: customer.customerId, ship_to_id: customer.shipToId, sale_channel_id: customer.saleChannelId, from_location_id: locationId, created_by: agent.userId });
    const status = () => client(agent.token).rpc("get_order_email_status", { p_brewery: breweryId, p_order: order.id });
    expect((await status()).error).toBeNull();
    setAgentsEnabled(breweryId, false);
    try {
      expect((await status()).error?.code).toBe("42501");
    } finally {
      setAgentsEnabled(breweryId, true);
    }
  });

  it("lists no invitations for an agent", async () => {
    sql(`insert into private.invite_requests (brewery_id, email, kind, role, auth_user_id, state, consent_expires_at, actor_id, request_id)
      values ('${breweryId}', '${email}', 'staff', 'warehouse', '${agent.userId}', 'pending_consent', now() + interval '1 day', '${agent.userId}', '${randomUUID()}')`);
    expect((await asUser(email).then((db) => db.rpc("list_my_invitations"))).data).toHaveLength(1);
    expect((await client(agent.token).rpc("list_my_invitations")).data).toEqual([]);
  });

  it("leaves the person's own session alone when agents are off", async () => {
    const person = await asUser(email);
    setAgentsEnabled(breweryId, false);
    try {
      expect((await person.from("breweries").select("id").eq("id", breweryId)).data).toHaveLength(1);
    } finally {
      setAgentsEnabled(breweryId, true);
    }
  });

  it("stops working as soon as the grant is revoked", async () => {
    const revoked = await connectAgent(email);
    const reader = client(revoked.token);
    expect((await reader.from("breweries").select("id").eq("id", breweryId)).data).toHaveLength(1);
    expect((await revoked.revoke()).error).toBeNull();
    expect((await reader.from("breweries").select("id").eq("id", breweryId)).data).toEqual([]);
    expect((await call(revoked.token, { breweryId, name: "get_today", input: {} })).status).toBe(401);
    expect((await reader.rpc("consume_command_admission")).error?.code).toBe("42501");
  });

  // Volatile functions with no `claim_command_request` in their own text: reads,
  // agent-safe writes, and writers the triggers cover another way. A new one
  // fails here until someone checks what an agent can do with it.
  it("has reviewed every volatile function without a ledger claim", () => {
    expect(sql(`select p.proname from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.provolatile = 'v'
        and has_function_privilege('authenticated', p.oid, 'execute')
        and pg_get_functiondef(p.oid) !~ 'claim_command_request'
      order by 1`)).toEqual([
      "begin_qbo_invoice_sync", "begin_square_catalog_sync", "cancel_purchase_order", "close_purchase_order_short",
      "complete_invite_membership", "consume_command_admission", "get_brew_day_plan", "get_brew_record",
      "get_material_count_preview", "get_order_email_status", "get_qbo_sync_status", "preview_inventory_movement",
      "record_invite_failure", "record_submitted_order_occurrence",
    ]);
  });
});

describe("the Admin switch for agents", () => {
  it("is off for a new brewery, and an Admin can turn it on and off", async () => {
    const adminCtx = await makeStaffCtx((await makeBrewery()).id, "admin");
    const isOn = async () => (await runCommand("get_brewery", {}, adminCtx) as { agents_enabled: boolean }).agents_enabled;
    expect(await isOn()).toBe(false);
    await runCommand("set_brewery_agents_enabled", { enabled: true }, adminCtx);
    expect(await isOn()).toBe(true);
    await runCommand("set_brewery_agents_enabled", { enabled: false }, adminCtx);
    expect(await isOn()).toBe(false);
  });

  it("is refused for everyone else", async () => {
    const warehouse = await makeStaffCtx((await makeBrewery()).id, "warehouse");
    await expect(runCommand("set_brewery_agents_enabled", { enabled: true }, warehouse)).rejects.toMatchObject({ code: "permission_denied" });
  });

  it("lists only the person's own breweries, each with its switch", async () => {
    const on = await makeBrewery();
    const off = await makeBrewery();
    await makeBrewery();
    const staff = await makeStaff(on.id, "warehouse");
    sql(`insert into public.brewery_users (brewery_id, user_id, roles) values ('${off.id}', '${staff.id}', array['sales']::public.staff_role[])`);
    setAgentsEnabled(on.id, true);
    const breweries = await runCommand("list_my_agent_breweries", {}, { db: await asUser(staff.email), userId: staff.id, breweryId: null, roles: [] }) as { id: string; agentsEnabled: boolean }[];
    expect(breweries.map(b => [b.id, b.agentsEnabled]).sort()).toEqual([[on.id, true], [off.id, false]].sort());
  });
});
