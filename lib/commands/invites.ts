import { z } from "zod";
import { definePreTenantCommand, definePreTenantQuery, defineCommand, defineQuery, unwrap, STAFF_ROLES, type StaffRole } from "./registry";

// Metadata is also read by docs tooling; load the server-only Auth boundary only on execution.

defineCommand({
  name: "invite_staff",
  description: "Invite staff",
  input: z.object({ email: z.string().email(), role: z.enum(STAFF_ROLES as [StaffRole, ...StaffRole[]]) }),
  roles: ["admin"],
  handler: async (ctx, input, execution) => (await import("@/lib/supabase/invites")).inviteStaff(ctx, input, execution),
});

defineCommand({
  name: "invite_customer_user",
  description: "Invite a customer portal user",
  input: z.object({ email: z.string().email(), customerId: z.string().uuid() }),
  roles: ["admin", "sales"],
  handler: async (ctx, input, execution) => (await import("@/lib/supabase/invites")).inviteCustomerUser(ctx, input, execution),
});

export type TeamMember = { userId: string; email: string; handle: string; role: string; createdAt: string };

defineQuery({
  name: "list_team_members", description: "Staff roster for the brewery: user id, email, @handle (the email's local part) and role",
  input: z.object({}), roles: ["admin", "sales", "warehouse"],
  handler: async (ctx): Promise<TeamMember[]> => {
    const rows = await unwrap(ctx.db.rpc("list_team_members", { p_brewery: ctx.breweryId })) as { user_id: string; email: string; role: string; created_at: string }[];
    return rows.map((r) => ({ userId: r.user_id, email: r.email, handle: `@${r.email.split("@")[0]}`, role: r.role, createdAt: r.created_at }));
  },
});

defineCommand({
  name: "update_staff_role", description: "Change one member's role (admin); refused when it would leave the brewery without an admin",
  input: z.object({ userId: z.string().uuid(), role: z.enum(STAFF_ROLES) }), roles: ["admin"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("update_staff_role", { p_brewery: ctx.breweryId, p_user: i.userId, p_role: i.role, p_request_id: execution.requestId })),
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

defineCommand({
  name: "revoke_account_invitation", description: "Revoke a pending existing-account invitation.",
  roles: ["admin", "sales"], input: z.object({ inviteId: z.uuid() }),
  handler: (ctx, input, execution) => unwrap(ctx.db.rpc("revoke_account_invitation", {
    p_brewery: ctx.breweryId, p_invite: input.inviteId, p_request_id: execution.requestId,
  })),
});
