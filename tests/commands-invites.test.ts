import { describe, it, expect, beforeAll } from "vitest";
import { makeBrewery, makeStaffCtx, admin, seedCustomer, sql } from "./helpers";
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
    const recipient = createClient(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, { auth: { persistSession: false } });
    const verified = await recipient.auth.verifyOtp({ token_hash, type: "invite" });
    expect(verified.error).toBeNull();
    const auth = createRequestAuthContext(() => Promise.resolve(recipient));
    expect(await inviteLanding(auth, kind)).toMatchObject({ audience: kind });
    expect(await inviteLanding(auth, kind === "staff" ? "customer" : "staff")).toBeFalsy();

    const reused = createClient(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, { auth: { persistSession: false } });
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
    const created = await admin.auth.admin.createUser({ email: address, password: "test-password-1", email_confirm: true, user_metadata: { mgr_invite_token: claim.authToken } });
    expect(created.error).toBeNull();
    expect(sql(`select auth_user_id is null from private.invite_requests where request_id = '${ex.requestId}'`)).toEqual(["t"]);
    await expect(ctx.db.rpc("complete_invite_membership", { p_request_id: ex.requestId })).resolves.toMatchObject({ error: { message: "invitation is awaiting Auth" } });
  });
  it("rejects warehouse permissions before creating Auth", async () => {
    await expect(runCommand("invite_staff", { email: email(), role: "sales" }, warehouse)).rejects.toMatchObject({ code: "permission_denied" });
  });
});
