// lib/commands/invites.ts — staff and customer-user invitations are
// registered but fail closed (audit P1.9): both previously used
// createAdminClient() (service role) in a request path, and that release
// gate is not yet approved. Names, role gates, and input contracts stay so
// direct /api/command posts are controlled CommandErrors; no auth-admin call
// or membership insert can happen. The working handlers are in git history.
// list_team_members, update_staff_role and revoke_staff (Program 10 task 5)
// are live: the roster comes from a definer RPC that may read auth.users, a
// member holds one role, and a revoke ends the membership row only.
import { z } from "zod";
import { defineCommand, defineQuery, unwrap, CommandError, STAFF_ROLES } from "./registry";

const blocked = async (): Promise<never> => { throw new CommandError("Invitations are not available in this release"); };

defineCommand({
  name: "invite_staff",
  description: "Invite staff (not available in this release)",
  input: z.object({ email: z.string().email(), role: z.enum(["admin", "sales", "warehouse", "brewer"]) }),
  roles: ["admin"],
  handler: blocked,
});

defineCommand({
  name: "invite_customer_user",
  description: "Invite a customer portal user (not available in this release)",
  input: z.object({ email: z.string().email(), customerId: z.string().uuid() }),
  roles: ["admin", "sales"],
  handler: blocked,
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
  input: z.object({ userId: z.string().uuid(), role: z.enum(STAFF_ROLES as [string, ...string[]]) }), roles: ["admin"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("update_staff_role", { p_brewery: ctx.breweryId, p_user: i.userId, p_role: i.role, p_request_id: execution.requestId })),
});

defineCommand({
  name: "revoke_staff", description: "End one member's brewery membership (admin); never yourself or the last admin; the sign-in account remains",
  input: z.object({ userId: z.string().uuid() }), roles: ["admin"], requiresConfirmation: true,
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("revoke_staff", { p_brewery: ctx.breweryId, p_user: i.userId, p_request_id: execution.requestId })),
});
