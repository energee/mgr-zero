import type { Database } from "@/lib/supabase/database";
import { assert } from "vitest";
import { describe, it, expect, beforeAll } from "vitest";
import { makeBrewery, makeStaffCtx, admin, seedCustomer, sql, seedLocation, seedCatalog, priceSku, makeCustomerUser, asUser } from "./helpers";
import { runCommand, type Ctx } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { inviteStaff, inviteCustomerUser } from "@/lib/supabase/invites";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env/public";
import { createRequestAuthContext } from "@/lib/auth/request-context";
import { inviteLanding } from "@/lib/auth/invite";

const execution = () => ({ requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() });
const email = () => `${crypto.randomUUID()}@test.local`;
describe("durable invitations", () => {
  let ctx: Ctx, warehouse: Ctx, customerId: string;
  beforeAll(async () => {
    const b = await makeBrewery();
    ctx = await makeStaffCtx(b.id);
    warehouse = await makeStaffCtx(b.id, "warehouse");
    customerId = (await seedCustomer(b.id)).customerId;
  });
  for (const kind of ["staff", "customer"] as const) {
    it(`${kind}: loses Auth response, keeps the bound identity, and retries without another account`, async () => {
      const address = email(), ex = execution();
      const input = kind === "staff" ? { email: address, role: "sales" as const } : { email: address, customerId };
      const fault = { afterAuth: async () => { throw new Error("injected after Auth"); } };
      await expect(kind === "staff"
        ? inviteStaff(ctx, { email: address, role: "sales" }, ex, fault)
        : inviteCustomerUser(ctx, { email: address, customerId }, ex, fault)).rejects.toMatchObject({ code: "invite_failed" });
      expect(sql(`select state || ':' || (auth_user_id is not null)::text from private.invite_requests where request_id = '${ex.requestId}'`)).toEqual(["pending_membership:true"]);
      expect(sql(`select count(*) from auth.users where email = '${address}'`)).toEqual(["1"]);
      const table = kind === "staff" ? "brewery_users" : "customer_users";
      const userId = sql(`select id from auth.users where email = '${address}'`)[0];
      expect((await admin.from(table).select("user_id").eq("user_id", userId)).data).toEqual([]);
      const name = kind === "staff" ? "invite_staff" : "invite_customer_user";
      expect(await runCommand(name, input, ctx, ex)).toEqual({ userId });
      expect(sql(`select count(*) from auth.users where email = '${address}'`)).toEqual(["1"]);
      expect((await admin.from(table).select("user_id").eq("user_id", userId)).data).toHaveLength(1);
      // Once complete, even concurrent retries must not regrant revoked access.
      await admin.from(table).delete().eq("user_id", userId);
      await Promise.all([runCommand(name, input, ctx, ex), runCommand(name, input, ctx, ex)]);
      expect((await admin.from(table).select("user_id").eq("user_id", userId)).data).toEqual([]);
    });
    it(`${kind}: a real membership constraint failure remains retryable`, async () => {
      const address = email(), ex = execution();
      const table = kind === "staff" ? "brewery_users" : "customer_users";
      const input = kind === "staff" ? { email: address, role: "sales" } : { email: address, customerId };
      const hook = { afterAuth: async () => {
        const userId = sql(`select id from auth.users where email = '${address}'`)[0];
        sql(`alter table public.${table} add constraint invite_test_failure check (user_id <> '${userId}'::uuid)`);
      } };
      try {
        await expect(kind === "staff" ? inviteStaff(ctx, { email: address, role: "sales" }, ex, hook)
          : inviteCustomerUser(ctx, { email: address, customerId }, ex, hook)).rejects.toMatchObject({ code: "db_error" });
        expect(sql(`select state from private.invite_requests where request_id = '${ex.requestId}'`)).toEqual(["pending_membership"]);
      } finally { sql(`alter table public.${table} drop constraint if exists invite_test_failure`); }
      await runCommand(kind === "staff" ? "invite_staff" : "invite_customer_user", input, ctx, ex);
      expect(sql(`select count(*) from auth.users where email = '${address}'`)).toEqual(["1"]);
    });
    it(`${kind}: completes and replays without duplicate Auth or membership`, async () => {
      const input = kind === "staff" ? { email: email(), role: "sales" } : { email: email(), customerId };
      const name = kind === "staff" ? "invite_staff" : "invite_customer_user";
      const ex = execution();
      const result = await runCommand(name, input, ctx, ex) as { userId: string };
      expect(await runCommand(name, input, ctx, ex)).toEqual(result);
      expect(sql(`select count(*) from auth.users where email = '${input.email}'`)).toEqual(["1"]);
      const table = kind === "staff" ? "brewery_users" : "customer_users";
      expect((await admin.from(table).select("user_id").eq("user_id", result.userId)).data).toHaveLength(1);
    });
  }
  it("refuses completion when the inviter loses admin after Auth succeeds", async () => {
    const local = await makeStaffCtx((await makeBrewery()).id);
    const address = email(), ex = execution();
    const hook = { afterAuth: async () => {
      await admin.from("brewery_users").update({ role: "warehouse" }).eq("brewery_id", local.breweryId).eq("user_id", local.userId);
    } };
    await expect(inviteStaff(local, { email: address, role: "sales" }, ex, hook)).rejects.toMatchObject({ code: "permission_denied" });
    const userId = sql(`select id from auth.users where email = '${address}'`)[0];
    expect(userId).toBeTruthy();
    expect((await local.db.rpc("complete_invite_membership", { p_request_id: ex.requestId })).error?.code).toBe("42501");
    expect((await admin.from("brewery_users").select("user_id").eq("user_id", userId)).data).toEqual([]);
    expect(sql(`select state from private.invite_requests where request_id = '${ex.requestId}'`)).toEqual(["pending_membership"]);
  });
  it("binds request identity to payload, kind, actor and brewery", async () => {
    const ex = execution(), input = { email: email(), role: "sales" };
    await runCommand("invite_staff", input, ctx, ex);
    await expect(runCommand("invite_staff", { ...input, role: "brewer" }, ctx, ex)).rejects.toMatchObject({ code: "conflict" });
    await expect(runCommand("invite_customer_user", { email: input.email, customerId }, ctx, ex)).rejects.toMatchObject({ code: "conflict" });
    const other = await makeStaffCtx((await makeBrewery()).id);
    await expect(runCommand("invite_staff", input, other, ex)).rejects.toMatchObject({ code: "conflict" });
    await expect(other.db.rpc("complete_invite_membership", { p_request_id: ex.requestId })).resolves.toMatchObject({ error: { code: "42501" } });
    await expect(runCommand("invite_staff", input, { ...ctx, breweryId: other.breweryId }, ex)).rejects.toMatchObject({ code: "permission_denied" });
    await expect(runCommand("invite_customer_user", { email: email(), customerId }, other)).rejects.toMatchObject({ code: "permission_denied" });
    await expect(runCommand("invite_staff", input, ctx)).rejects.toMatchObject({ code: "conflict" });
  });
  it("shares request identity with ordinary commands in both directions", async () => {
    const first = execution();
    await runCommand("invite_staff", { email: email(), role: "sales" }, ctx, first);
    await expect(runCommand("set_my_gravity_unit", { unit: "plato" }, ctx, first)).rejects.toMatchObject({ code: "conflict" });
    const second = execution();
    await runCommand("set_my_gravity_unit", { unit: "plato" }, ctx, second);
    await expect(runCommand("invite_staff", { email: email(), role: "sales" }, ctx, second)).rejects.toMatchObject({ code: "conflict" });
  });
  it.each(["staff", "customer"] as const)("%s: the delivered SSR link consumes once and rejects the wrong audience", async (kind) => {
    const address = email();
    if (kind === "staff") await runCommand("invite_staff", { email: address, role: "sales" }, ctx);
    else await runCommand("invite_customer_user", { email: address, customerId }, ctx);
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
    expect(["127.0.0.1", "localhost"]).toContain(url.hostname);
    url.port = String(Number(url.port) + 3); // Both committed stacks put Mailpit three ports after Auth's API.
    url.pathname = "/api/v1/search";
    url.searchParams.set("query", `to:${address}`);
    const response = await fetch(url);
    expect(response.ok).toBe(true);
    const mail = await response.json();
    expect(mail.messages).toHaveLength(1);
    expect(mail.messages[0].Subject).toBe("You have been invited");
    const message = await fetch(`${url.origin}/api/v1/message/${mail.messages[0].ID}`).then((r) => r.json());
    const link = new URL(message.HTML.match(/href="([^"]+)"/)?.[1].replaceAll("&amp;", "&"));
    expect(link.pathname).toBe("/auth/confirm");
    expect(link.searchParams.get("type")).toBe("invite");
    expect(link.searchParams.get("audience")).toBe(kind);

    const token_hash = link.searchParams.get("token_hash")!;
    const recipient = createClient<Database>(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, { auth: { persistSession: false } });
    const verified = await recipient.auth.verifyOtp({ token_hash, type: "invite" });
    expect(verified.error).toBeNull();
    const auth = createRequestAuthContext(() => Promise.resolve(recipient));
    expect(await inviteLanding(auth, kind)).toMatchObject({ audience: kind });
    expect(await inviteLanding(auth, kind === "staff" ? "customer" : "staff")).toBeFalsy();

    const reused = createClient<Database>(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, { auth: { persistSession: false } });
    expect((await reused.auth.verifyOtp({ token_hash, type: "invite" })).error).not.toBeNull();
  });
  it("concurrent first attempts produce one account and membership", async () => {
    const ex = execution(), input = { email: email(), role: "brewer" };
    const outcomes = await Promise.allSettled(Array.from({ length: 3 }, () => runCommand("invite_staff", input, ctx, ex)));
    expect(outcomes.some(o => o.status === "fulfilled")).toBe(true);
    await runCommand("invite_staff", input, ctx, ex);
    expect(sql(`select count(*) from auth.users u join public.brewery_users b on b.user_id = u.id where u.email = '${input.email}'`)).toEqual(["1"]);
  });
  it("rechecks database roles even when the supplied context claims admin", async () => {
    await expect(runCommand("invite_staff", { email: email(), role: "admin" }, { ...warehouse, role: "admin", userId: ctx.userId })).rejects.toMatchObject({ code: "permission_denied" });
    const sales = await makeStaffCtx(ctx.breweryId, "sales");
    await expect(runCommand("invite_staff", { email: email(), role: "sales" }, sales)).rejects.toMatchObject({ code: "permission_denied" });
    await expect(runCommand("invite_customer_user", { email: email(), customerId }, sales)).resolves.toHaveProperty("userId");
  });
  it("uninvited Auth creation with matching metadata cannot self-claim", async () => {
    const ex = execution(), address = email();
    const { data: claim, error } = await ctx.db.rpc("claim_invite_request", { p_brewery: ctx.breweryId, p_email: address, p_kind: "staff", p_role: "sales", p_customer: null, p_request_id: ex.requestId });
    expect(error).toBeNull();
    assert(claim !== null);
    const created = await admin.auth.admin.createUser({ email: address, password: "test-password-1", email_confirm: true, user_metadata: { mgr_invite_token: claim.authToken } });
    expect(created.error).toBeNull();
    expect(sql(`select auth_user_id is null from private.invite_requests where request_id = '${ex.requestId}'`)).toEqual(["t"]);
    await expect(ctx.db.rpc("complete_invite_membership", { p_request_id: ex.requestId })).resolves.toMatchObject({ error: { message: "invitation is awaiting Auth" } });
  });
  // #457: an unfinished request blocks only its own brewery, and a failed one never blocks.
  const claimOnly = (c: Ctx, address: string, requestId: string) => c.db.rpc("claim_invite_request", {
    p_brewery: c.breweryId, p_email: address, p_kind: "staff", p_role: "sales", p_customer: null, p_request_id: requestId,
  });
  it("another brewery's pending request does not block the address", async () => {
    const other = await makeStaffCtx((await makeBrewery()).id);
    const address = email();
    expect((await claimOnly(other, address, crypto.randomUUID())).error).toBeNull(); // never sent to Auth
    expect((await claimOnly(other, address.toUpperCase(), crypto.randomUUID())).error?.message).toBe("invitation already requested");
    expect(await runCommand("invite_staff", { email: address, role: "sales" }, ctx)).toHaveProperty("userId");
  });
  it("a failed request can be retried under a new request id", async () => {
    const address = email(), first = crypto.randomUUID();
    expect((await claimOnly(ctx, address, first)).error).toBeNull();
    expect((await ctx.db.rpc("record_invite_failure", { p_request_id: first })).error).toBeNull();
    expect(sql(`select state from private.invite_requests where request_id = '${first}'`)).toEqual(["failed"]);
    const retry = execution();
    const { userId } = await runCommand("invite_staff", { email: address, role: "sales" }, ctx, retry) as { userId: string };
    expect(sql(`select auth_user_id from private.invite_requests where request_id = '${retry.requestId}'`)).toEqual([userId]);
    expect(sql(`select state || ':' || (auth_user_id is null)::text from private.invite_requests where request_id = '${first}'`)).toEqual(["failed:true"]);
    expect(sql(`select count(*) from auth.users where email = '${address}'`)).toEqual(["1"]);
  });
  // #580: a crash before record_invite_failure left pending_auth forever. After
  // 15 minutes a new claim in the same brewery marks it failed and proceeds.
  it("a request stuck in pending_auth expires after 15 minutes in its own brewery only", async () => {
    const other = await makeStaffCtx((await makeBrewery()).id);
    const address = email(), stuck = crypto.randomUUID(), elsewhere = crypto.randomUUID();
    expect((await claimOnly(ctx, address, stuck)).error).toBeNull(); // crashed before Auth
    expect((await claimOnly(other, address, elsewhere)).error).toBeNull();
    expect((await claimOnly(ctx, address, crypto.randomUUID())).error?.message).toBe("invitation already requested");
    sql(`update private.invite_requests set created_at = now() - interval '16 minutes' where request_id in ('${stuck}', '${elsewhere}')`, true);
    const retry = execution();
    const { userId } = await runCommand("invite_staff", { email: address, role: "sales" }, ctx, retry) as { userId: string };
    expect(sql(`select auth_user_id from private.invite_requests where request_id = '${retry.requestId}'`)).toEqual([userId]);
    expect(sql(`select state || ':' || (auth_user_id is null)::text from private.invite_requests where request_id = '${stuck}'`)).toEqual(["failed:true"]);
    expect(sql(`select state from private.invite_requests where request_id = '${elsewhere}'`)).toEqual(["pending_auth"]);
  });
  it("rejects warehouse permissions before creating Auth", async () => {
    await expect(runCommand("invite_staff", { email: email(), role: "sales" }, warehouse)).rejects.toMatchObject({ code: "permission_denied" });
  });
});

// #616: Admin and Sales list a customer's portal users and revoke one. The
// membership row goes (the command ledger keeps it), the Auth user stays, and
// a buyer whose session is still live loses portal reads and writes at once,
// because RLS, the RPCs and the request context all read customer_users per
// request rather than from the token.
describe("portal user revocation", () => {
  type PortalUser = { userId: string; email: string; createdAt: string };
  let staff: Ctx, sales: Ctx, brewer: Ctx, customerId: string, shipToId: string, skuId: string;
  beforeAll(async () => {
    const b = await makeBrewery();
    staff = await makeStaffCtx(b.id);
    sales = await makeStaffCtx(b.id, "sales");
    brewer = await makeStaffCtx(b.id, "brewer");
    const warehouse = await seedLocation(b.id);
    const cat = await seedCatalog(b.id);
    skuId = cat.skuId;
    let saleChannelId: string;
    ({ customerId, shipToId, saleChannelId } = await seedCustomer(b.id));
    await priceSku(b.id, { saleChannelId, brandId: cat.brandId, formatId: cat.formatId, cents: 3600 });
    await runCommand("set_portal_fulfillment_source", { locationId: warehouse.id }, staff);
  });
  const buyer = async () => {
    const user = await makeCustomerUser(customerId);
    const db = await asUser(user.email);
    return { user, ctx: { db, userId: user.id, breweryId: staff.breweryId, role: "customer" as const, customerId } };
  };
  const list = (c: Ctx) => runCommand("list_customer_users", { customerId }, c) as Promise<PortalUser[]>;

  it("lists a customer's portal users with email to Admin and Sales only", async () => {
    const { user } = await buyer();
    expect((await list(staff)).find((u) => u.userId === user.id)?.email).toBe(user.email);
    expect((await list(sales)).some((u) => u.userId === user.id)).toBe(true);
    await expect(list(brewer)).rejects.toMatchObject({ code: "permission_denied" });
    // the definer RPC is granted to authenticated, so it applies the same rule
    const { data } = await brewer.db.rpc("list_customer_users", { p_brewery: staff.breweryId, p_customer: customerId });
    expect(data).toEqual([]);
  });

  it("revokes one buyer: a live session loses portal reads and writes, the Auth user stays", async () => {
    const { user, ctx: live } = await buyer();
    const order = { shipToId, lines: [{ skuId, qty: 1 }] };
    await expect(runCommand("portal_create_order", order, live)).resolves.toHaveProperty("order_id");
    expect((await live.db.from("customers").select("id")).data).toHaveLength(1);

    await runCommand("revoke_customer_user", { customerId, userId: user.id }, sales);

    expect((await list(staff)).some((u) => u.userId === user.id)).toBe(false);
    expect((await admin.auth.admin.getUserById(user.id)).data.user?.id).toBe(user.id);
    expect((await live.db.from("customers").select("id")).data).toEqual([]);
    expect((await live.db.from("orders").select("id")).data).toEqual([]);
    await expect(runCommand("portal_orders", {}, live)).resolves.toEqual([]);
    await expect(runCommand("portal_create_order", order, live)).rejects.toMatchObject({ code: "permission_denied" });
    // the next request resolves no membership, so the portal layout sends them away
    expect(await createRequestAuthContext(async () => live.db).getCustomerMemberships()).toEqual([]);
  });

  it("replays the same request, and a second revoke finds no portal user", async () => {
    const { user } = await buyer();
    const ex = execution(), input = { customerId, userId: user.id };
    const first = await runCommand("revoke_customer_user", input, staff, ex);
    expect(await runCommand("revoke_customer_user", input, staff, ex)).toEqual(first);
    await expect(runCommand("revoke_customer_user", input, staff)).rejects.toThrow(/portal user not found/);
  });

  it("refuses Warehouse, Brewer and another brewery; their memberships stay", async () => {
    const { user } = await buyer();
    const input = { customerId, userId: user.id };
    await expect(runCommand("revoke_customer_user", input, brewer)).rejects.toMatchObject({ code: "permission_denied" });
    await expect(runCommand("revoke_customer_user", input, { ...brewer, role: "admin" })).rejects.toMatchObject({ code: "permission_denied" });
    const other = await makeStaffCtx((await makeBrewery()).id);
    await expect(runCommand("revoke_customer_user", input, other)).rejects.toThrow(/portal user not found/);
    await expect(runCommand("list_customer_users", { customerId }, other)).resolves.toEqual([]);
    expect((await admin.from("customer_users").select("user_id").eq("user_id", user.id)).data).toHaveLength(1);
  });
});
