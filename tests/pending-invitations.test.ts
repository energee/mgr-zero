// tests/pending-invitations.test.ts — #1204: Team lists the brewery's pending
// (not yet accepted) staff invitations to admins. Resend renews one with the
// same role and retires the old one; Cancel revokes it. Either way the old
// invitation can no longer be accepted.
import { describe, expect, it } from "vitest";
import "@/lib/commands/all";
import { runCommand, type PreTenantCtx } from "@/lib/commands/registry";
import type { PendingInvitation } from "@/lib/commands/invites";
import { asUser, makeBrewery, makeStaff, makeStaffCtx, seedCustomer } from "./helpers";

const execution = () => ({ requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() });

async function invited(role: "sales" | "brewer" = "sales") {
  const inviter = await makeStaffCtx((await makeBrewery()).id);
  const recipient = await makeStaff((await makeBrewery()).id);
  const recipientCtx: PreTenantCtx = { db: await asUser(recipient.email), userId: recipient.id, breweryId: null, roles: [] };
  const { inviteId } = await runCommand("invite_staff", { email: recipient.email, role }, inviter) as { inviteId: string };
  const pending = () => runCommand("list_pending_invitations", {}, inviter) as Promise<PendingInvitation[]>;
  return { inviter, recipient, recipientCtx, inviteId, pending };
}

describe("pending invitations", () => {
  it("lists only this brewery's unaccepted staff invitations, to admins only", async () => {
    const { inviter, recipient, recipientCtx, inviteId, pending } = await invited("brewer");
    const buyer = await makeStaff((await makeBrewery()).id);
    const customer = await seedCustomer(inviter.breweryId);
    await runCommand("invite_customer_user", { email: buyer.email, customerId: customer.customerId }, inviter);
    const rows = await pending();
    expect(rows).toEqual([{ id: inviteId, email: recipient.email.toLowerCase(), role: "brewer", createdAt: expect.any(String) }]);
    expect(Number.isNaN(Date.parse(rows[0].createdAt))).toBe(false);

    const sales = await makeStaffCtx(inviter.breweryId, "sales");
    await expect(runCommand("list_pending_invitations", {}, sales)).rejects.toThrow(/permission denied/);
    // The definer RPC is granted to authenticated, so it applies the same rule.
    expect((await sales.db.rpc("list_pending_invitations", { p_brewery: inviter.breweryId })).data).toEqual([]);
    const other = await makeStaffCtx((await makeBrewery()).id);
    expect(await runCommand("list_pending_invitations", {}, other)).toEqual([]);

    await runCommand("accept_account_invitation", { inviteId }, recipientCtx);
    expect(await pending()).toEqual([]);
  });

  it("resends with the same role; only the new invitation can be accepted", async () => {
    const { inviter, recipient, recipientCtx, inviteId, pending } = await invited();
    const sales = await makeStaffCtx(inviter.breweryId, "sales");
    await expect(runCommand("resend_account_invitation", { inviteId }, sales)).rejects.toThrow(/permission denied/);

    const ex = execution();
    const resent = await runCommand("resend_account_invitation", { inviteId }, inviter, ex) as { inviteId: string };
    expect(resent.inviteId).not.toBe(inviteId);
    expect(await runCommand("resend_account_invitation", { inviteId }, inviter, ex)).toEqual(resent);
    expect(await pending()).toEqual([{ id: resent.inviteId, email: recipient.email.toLowerCase(), role: "sales", createdAt: expect.any(String) }]);

    await expect(runCommand("accept_account_invitation", { inviteId }, recipientCtx)).rejects.toThrow(/expired or revoked/);
    expect(await runCommand("accept_account_invitation", { inviteId: resent.inviteId }, recipientCtx)).toMatchObject({ breweryId: inviter.breweryId });
    await expect(runCommand("resend_account_invitation", { inviteId: resent.inviteId }, inviter)).rejects.toThrow(/not pending/);
  });

  it("cancel revokes the invitation so accepting it is refused", async () => {
    const { inviter, recipientCtx, inviteId, pending } = await invited();
    await runCommand("revoke_account_invitation", { inviteId }, inviter);
    expect(await pending()).toEqual([]);
    await expect(runCommand("accept_account_invitation", { inviteId }, recipientCtx)).rejects.toThrow(/expired or revoked/);
    expect(await runCommand("list_my_invitations", {}, recipientCtx)).toEqual([]);
  });
});
