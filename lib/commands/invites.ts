import { z } from "zod";
import { email } from "@/lib/mgr/email";
import { definePreTenantCommand, definePreTenantQuery, defineCommand, defineQuery, unwrap, STAFF_ROLES, type StaffRole } from "./registry";

// Metadata is also read by docs tooling; load the server-only Auth boundary only on execution.

defineCommand({
  name: "invite_staff",
  description: "Invite staff",
  input: z.object({ email, role: z.enum(STAFF_ROLES) }),
  roles: ["admin"],
  handler: async (ctx, input, execution) => (await import("@/lib/supabase/invites")).inviteStaff(ctx, input, execution),
});

defineCommand({
  name: "invite_customer_user",
  description: "Invite a customer portal user",
  input: z.object({ email, customerId: z.string().uuid() }),
  roles: ["admin", "sales"],
  handler: async (ctx, input, execution) => (await import("@/lib/supabase/invites")).inviteCustomerUser(ctx, input, execution),
});

export type TeamMember = { userId: string; email: string; name: string; roles: StaffRole[]; createdAt: string };

defineQuery({
  name: "list_team_members", description: "Staff roster for the brewery: user id, name as `Profile name <email>` (the email alone when no profile name is saved), email and roles",
  input: z.object({}), roles: ["admin", "sales", "warehouse"],
  handler: async (ctx): Promise<TeamMember[]> => {
    // A table-returning RPC returns an array, including [] for an empty roster.
    const rows = (await unwrap(ctx.db.rpc("list_team_members", { p_brewery: ctx.breweryId })))!;
    return rows.map((r) => ({ userId: r.user_id, email: r.email, name: r.name, roles: r.roles, createdAt: r.created_at }));
  },
});

defineCommand({
  name: "update_staff_role", description: "Change one member's roles (admin); refused when it would leave the brewery without an admin",
  input: z.object({ userId: z.string().uuid(), roles: z.array(z.enum(STAFF_ROLES)).min(1) }), roles: ["admin"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("update_staff_role", { p_brewery: ctx.breweryId, p_user: i.userId, p_roles: i.roles, p_request_id: execution.requestId })),
});

defineCommand({
  name: "revoke_staff", description: "End one member's brewery membership (admin); never yourself or the last admin; the sign-in account remains",
  input: z.object({ userId: z.string().uuid() }), roles: ["admin"], requiresConfirmation: true,
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("revoke_staff", { p_brewery: ctx.breweryId, p_user: i.userId, p_request_id: execution.requestId })),
});

export type PortalUser = { userId: string; email: string; createdAt: string };

defineQuery({
  name: "list_customer_users", description: "One customer's portal users: user id, email and when access was granted",
  input: z.object({ customerId: z.string().uuid() }), roles: ["admin", "sales"],
  handler: async (ctx, i): Promise<PortalUser[]> => {
    const rows = await unwrap(ctx.db.rpc("list_customer_users", { p_brewery: ctx.breweryId, p_customer: i.customerId })) as { user_id: string; email: string; created_at: string }[];
    return rows.map((r) => ({ userId: r.user_id, email: r.email, createdAt: r.created_at }));
  },
});

defineCommand({
  name: "revoke_customer_user", description: "End one buyer's portal access to a customer (admin or sales); the sign-in account remains",
  input: z.object({ customerId: z.string().uuid(), userId: z.string().uuid() }), roles: ["admin", "sales"], requiresConfirmation: true,
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("revoke_customer_user", { p_brewery: ctx.breweryId, p_customer: i.customerId, p_user: i.userId, p_request_id: execution.requestId })),
});

definePreTenantQuery({
  name: "list_my_invitations", description: "List pending invitations for this signed-in account.",
  input: z.object({}), handler: ctx => unwrap(ctx.db.rpc("list_my_invitations")),
});
definePreTenantCommand({
  name: "accept_account_invitation", description: "Consent to join the brewery or customer account in an invitation.",
  input: z.object({ inviteId: z.uuid() }),
  handler: (ctx, input, execution) => unwrap(ctx.db.rpc("accept_account_invitation", {
    p_invite: input.inviteId, p_request_id: execution.requestId,
  })),
});

export type PendingInvitation = { id: string; email: string; role: StaffRole; createdAt: string };

defineQuery({
  name: "list_pending_invitations", description: "Staff invitations an existing account has not yet accepted (admin): invite id, email, role and when it was sent",
  input: z.object({}), roles: ["admin"],
  handler: async (ctx): Promise<PendingInvitation[]> => {
    const rows = await unwrap(ctx.db.rpc("list_pending_invitations", { p_brewery: ctx.breweryId })) as { id: string; email: string; role: StaffRole; created_at: string }[];
    return rows.map((r) => ({ id: r.id, email: r.email, role: r.role, createdAt: r.created_at }));
  },
});

defineCommand({
  name: "resend_account_invitation", description: "Resend a pending existing-account invitation with the same role (admin); the old invitation can no longer be accepted",
  roles: ["admin"], input: z.object({ inviteId: z.uuid() }),
  handler: (ctx, input, execution) => unwrap(ctx.db.rpc("resend_account_invitation", {
    p_brewery: ctx.breweryId, p_invite: input.inviteId, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "revoke_account_invitation", description: "Revoke a pending existing-account invitation.",
  roles: ["admin", "sales"], input: z.object({ inviteId: z.uuid() }),
  handler: (ctx, input, execution) => unwrap(ctx.db.rpc("revoke_account_invitation", {
    p_brewery: ctx.breweryId, p_invite: input.inviteId, p_request_id: execution.requestId,
  })),
});
