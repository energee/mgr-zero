// lib/commands/invites.ts — staff and customer-user invitations are
// registered but fail closed (audit P1.9): both previously used
// createAdminClient() (service role) in a request path, and that release
// gate is not yet approved. Names, role gates, and input contracts stay so
// direct /api/command posts are controlled CommandErrors; no auth-admin call
// or membership insert can happen. The working handlers are in git history.
// list_team_members is unaffected.
import { z } from "zod";
import { defineCommand, defineQuery, unwrap, CommandError } from "./registry";

const blocked = async (): Promise<never> => { throw new CommandError("Invitations are not available in this release"); };

defineCommand({
  name: "invite_staff",
  description: "Invite staff — not available in this release",
  input: z.object({ email: z.string().email(), role: z.enum(["admin", "sales", "warehouse", "brewer"]) }),
  roles: ["admin"],
  handler: blocked,
});

defineCommand({
  name: "invite_customer_user",
  description: "Invite a customer portal user — not available in this release",
  input: z.object({ email: z.string().email(), customerId: z.string().uuid() }),
  roles: ["admin", "sales"],
  handler: blocked,
});

defineQuery({
  name: "list_team_members", description: "Staff memberships for the brewery (user id + role; emails live in auth and are not readable under RLS)",
  input: z.object({}), roles: ["admin", "sales", "warehouse"],
  handler: (ctx) => unwrap(ctx.db.from("brewery_users").select("user_id, role").eq("brewery_id", ctx.breweryId).order("role")),
});
