import { ctxForBearer } from "@/lib/commands/context";
import { describe, expect, it } from "vitest";
import "@/lib/commands/all";
import { runCommand, type PreTenantCtx } from "@/lib/commands/registry";
import { admin, asUser, makeBrewery, makeStaff, makeStaffCtx, seedCustomer, sql } from "./helpers";

const execution = () => ({ requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() });

describe("existing account invitation consent", () => {
  it.each(["staff", "customer"] as const)("%s: grants only after recipient consent, never again on replay", async kind => {
    const inviter = await makeStaffCtx((await makeBrewery()).id);
    const recipient = await makeStaff((await makeBrewery()).id);
    const customer = await seedCustomer(inviter.breweryId);
    const ctx: PreTenantCtx = { db: await asUser(recipient.email), userId: recipient.id, breweryId: null, role: null };
    const ex = execution();
    const name = kind === "staff" ? "invite_staff" : "invite_customer_user";
    const input = kind === "staff" ? { email: recipient.email, role: "sales" } : { email: recipient.email, customerId: customer.customerId };
    const result = await runCommand(name, input, inviter, ex) as { inviteId: string; state: string };
    expect(result.state).toBe("pending_consent");
    const membership = () => kind === "staff"
      ? admin.from("brewery_users").select("user_id").eq("user_id", recipient.id).eq("brewery_id", inviter.breweryId)
      : admin.from("customer_users").select("user_id").eq("user_id", recipient.id).eq("customer_id", customer.customerId);
    expect((await membership()).data).toEqual([]);
    expect(await runCommand(name, input, inviter, ex)).toEqual(result);
    const pending = await runCommand("list_my_invitations", {}, ctx) as { id: string }[];
    expect(pending.map(row => row.id)).toContain(result.inviteId);
    const accept = execution();
    const accepted = await runCommand("accept_account_invitation", { inviteId: result.inviteId }, ctx, accept);
    expect((await membership()).data).toHaveLength(1);
    if (kind === "staff") await admin.from("brewery_users").delete().eq("user_id", recipient.id).eq("brewery_id", inviter.breweryId);
    else await admin.from("customer_users").delete().eq("user_id", recipient.id).eq("customer_id", customer.customerId);
    expect(await runCommand("accept_account_invitation", { inviteId: result.inviteId }, ctx, accept)).toEqual(accepted);
    expect((await membership()).data).toEqual([]);
    const renewed = await runCommand(name, input, inviter, execution()) as { inviteId: string };
    expect(renewed.inviteId).not.toBe(result.inviteId);
    expect((await membership()).data).toEqual([]);
    await runCommand("accept_account_invitation", { inviteId: renewed.inviteId }, ctx, execution());
    expect((await membership()).data).toHaveLength(1);
  });

  it("rejects wrong identity and expired invitations", async () => {
    const inviter = await makeStaffCtx((await makeBrewery()).id);
    const recipient = await makeStaff((await makeBrewery()).id);
    const ctx: PreTenantCtx = { db: await asUser(recipient.email), userId: recipient.id, breweryId: null, role: null };
    const result = await runCommand("invite_staff", { email: recipient.email, role: "sales" }, inviter) as { inviteId: string };
    const wrong: PreTenantCtx = { ...inviter, breweryId: null, role: null };
    await expect(runCommand("accept_account_invitation", { inviteId: result.inviteId }, wrong)).rejects.toMatchObject({ code: "permission_denied" });
    sql(`update private.invite_requests set consent_expires_at = now() - interval '1 second' where id = '${result.inviteId}'`);
    await expect(runCommand("accept_account_invitation", { inviteId: result.inviteId }, ctx)).rejects.toThrow(/expired/);
  });
  it.each(["revoked", "permission", "email"])("rejects consent after %s changes", async change => {
    const inviter = await makeStaffCtx((await makeBrewery()).id);
    const recipient = await makeStaff((await makeBrewery()).id);
    const ctx: PreTenantCtx = { db: await asUser(recipient.email), userId: recipient.id, breweryId: null, role: null };
    const result = await runCommand("invite_staff", { email: recipient.email, role: "sales" }, inviter) as { inviteId: string };
    if (change === "revoked") await runCommand("revoke_account_invitation", { inviteId: result.inviteId }, inviter);
    if (change === "permission") await admin.from("brewery_users").delete().eq("user_id", inviter.userId).eq("brewery_id", inviter.breweryId);
    if (change === "email") await admin.auth.admin.updateUserById(recipient.id, { email: `${crypto.randomUUID()}@test.local` });
    await expect(runCommand("accept_account_invitation", { inviteId: result.inviteId }, ctx)).rejects.toThrow();
    expect((await admin.from("brewery_users").select("user_id").eq("user_id", recipient.id).eq("brewery_id", inviter.breweryId)).data).toEqual([]);
  });

  it("selects the newly accepted customer when the buyer already has one in this brewery", async () => {
    const inviter = await makeStaffCtx((await makeBrewery()).id);
    const recipient = await makeStaff((await makeBrewery()).id);
    const first = await seedCustomer(inviter.breweryId, { name: "First customer" });
    const second = await seedCustomer(inviter.breweryId, { name: "Second customer" });
    await admin.from("customer_users").insert({ customer_id: first.customerId, user_id: recipient.id });
    const db = await asUser(recipient.email);
    const ctx: PreTenantCtx = { db, userId: recipient.id, breweryId: null, role: null };
    const result = await runCommand("invite_customer_user", { email: recipient.email, customerId: second.customerId }, inviter) as { inviteId: string };
    expect(await runCommand("accept_account_invitation", { inviteId: result.inviteId }, ctx)).toMatchObject({ customerId: second.customerId });
    expect(await ctxForBearer(db, recipient.id, inviter.breweryId, second.customerId)).toMatchObject({ customerId: second.customerId, role: "customer" });
    await expect(ctxForBearer(db, recipient.id, inviter.breweryId, crypto.randomUUID())).rejects.toMatchObject({ code: "not_member" });
  });

});
