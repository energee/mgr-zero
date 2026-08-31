// lib/commands/invites.ts — staff and customer-user invitations.
//
// invite_staff and invite_customer_user are the two sanctioned uses of
// createAdminClient() in a request path: auth.admin.inviteUserByEmail needs
// the service role, and the membership insert must bypass RLS because the
// invited user isn't the caller. Both handlers run the registry's role check
// (via runCommand, before the handler body executes) before touching the
// admin client — that's what keeps this safe. invite_customer_user also
// verifies the target customer belongs to ctx.breweryId using ctx.db (the
// RLS-bound client) before ever using the admin client, so a caller cannot
// attach a user to a customer in a brewery they don't belong to.
import { z } from "zod";
import { defineCommand, defineQuery, unwrap, CommandError } from "./registry";
import { createAdminClient } from "@/lib/supabase/admin";

// Resolves an already-registered email to its user id by paging through
// auth.admin.listUsers(). The installed supabase-js (2.112.4) has no
// server-side email filter on this endpoint (PageParams is just
// { page, perPage }), so this pages client-side with a generous perPage and
// a sane page-count cap rather than assuming everything fits on page 1.
const LIST_USERS_PER_PAGE = 200;
const LIST_USERS_MAX_PAGES = 50;

async function findUserByEmail(adminClient: ReturnType<typeof createAdminClient>, email: string): Promise<string> {
  const target = email.toLowerCase();
  for (let page = 1; page <= LIST_USERS_MAX_PAGES; page++) {
    const { data: list, error: listError } = await adminClient.auth.admin.listUsers({ page, perPage: LIST_USERS_PER_PAGE });
    if (listError) throw new CommandError(listError.message);
    const existing = list.users.find((u) => u.email?.toLowerCase() === target);
    if (existing) return existing.id;
    if (list.users.length < LIST_USERS_PER_PAGE) break; // last page
  }
  throw new CommandError(`could not resolve existing user for ${email}`);
}

// Invites `email` via Supabase auth admin, tolerating the case where the
// email is already registered (resolves the existing user id instead of
// failing). Returns the user id either way.
async function inviteOrResolveUser(email: string): Promise<string> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email);
  if (!error) return data.user.id;

  // Already-registered emails come back as an error from inviteUserByEmail;
  // resolve the existing user id instead of failing.
  const alreadyRegistered = /already.*registered|already.*exists/i.test(error.message);
  if (!alreadyRegistered) throw new CommandError(error.message);

  return findUserByEmail(adminClient, email);
}

// Inserts a membership row via the admin client. The table's primary key is
// the only duplicate guard needed: a unique violation (Postgres 23505) —
// whether from a repeat invite or a racing concurrent one — becomes the
// friendly message, so there is one code path instead of a pre-check plus
// a catch that must stay in sync.
async function insertMembership(table: "brewery_users" | "customer_users", row: Record<string, string>, duplicateMessage: string) {
  const { error } = await createAdminClient().from(table).insert(row);
  if (error) throw new CommandError(error.code === "23505" ? duplicateMessage : error.message);
}

defineCommand({
  name: "invite_staff",
  description: "Invite a user to join the brewery's staff",
  input: z.object({ email: z.string().email(), role: z.enum(["admin", "sales", "warehouse", "brewer"]) }),
  roles: ["admin"],
  handler: async (ctx, i) => {
    const userId = await inviteOrResolveUser(i.email);
    await insertMembership("brewery_users", { brewery_id: ctx.breweryId, user_id: userId, role: i.role },
      `${i.email} is already a member of this brewery`);
    return { userId };
  },
});

defineCommand({
  name: "invite_customer_user",
  description: "Invite a user to access a customer's portal",
  input: z.object({ email: z.string().email(), customerId: z.string().uuid() }),
  roles: ["admin", "sales"],
  handler: async (ctx, i) => {
    // RLS-bound check first, using the caller's own client — never the admin
    // client — so a customer belonging to another brewery is invisible here
    // and the insert below never happens for it.
    const customer = await unwrap(ctx.db.from("customers").select("id").eq("id", i.customerId).eq("brewery_id", ctx.breweryId).maybeSingle());
    if (!customer) throw new CommandError(`customer not found: ${i.customerId}`);

    const userId = await inviteOrResolveUser(i.email);
    await insertMembership("customer_users", { customer_id: i.customerId, user_id: userId },
      `${i.email} already has access to this customer`);
    return { userId };
  },
});

defineQuery({
  name: "list_team_members", description: "Staff memberships for the brewery (user id + role; emails live in auth and are not readable under RLS)",
  input: z.object({}), roles: ["admin", "sales", "warehouse"],
  handler: (ctx) => unwrap(ctx.db.from("brewery_users").select("user_id, role").eq("brewery_id", ctx.breweryId).order("role")),
});
