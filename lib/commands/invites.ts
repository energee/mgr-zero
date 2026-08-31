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
import { defineCommand, CommandError } from "./registry";
import { createAdminClient } from "@/lib/supabase/admin";

// Invites `email` via Supabase auth admin, tolerating the case where the
// email is already registered (resolves the existing user id instead of
// failing). Returns the user id either way.
async function inviteOrResolveUser(email: string): Promise<string> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email);
  if (!error) return data.user.id;

  // Already-registered emails come back as an error from inviteUserByEmail;
  // resolve the existing user id by listing and filtering client-side
  // (admin.auth.admin has no getUserByEmail).
  const alreadyRegistered = /already.*registered|already.*exists/i.test(error.message);
  if (!alreadyRegistered) throw new CommandError(error.message);

  const { data: list, error: listError } = await adminClient.auth.admin.listUsers();
  if (listError) throw new CommandError(listError.message);
  const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!existing) throw new CommandError(`could not resolve existing user for ${email}`);
  return existing.id;
}

defineCommand({
  name: "invite_staff",
  description: "Invite a user to join the brewery's staff",
  input: z.object({ email: z.string().email(), role: z.enum(["admin", "sales", "warehouse"]) }),
  roles: ["admin"],
  handler: async (ctx, i) => {
    const userId = await inviteOrResolveUser(i.email);

    const adminClient = createAdminClient();
    const { data: existingMembership } = await adminClient
      .from("brewery_users")
      .select("user_id")
      .eq("brewery_id", ctx.breweryId)
      .eq("user_id", userId)
      .maybeSingle();
    if (existingMembership) throw new CommandError(`${i.email} is already a member of this brewery`);

    const { error } = await adminClient
      .from("brewery_users")
      .insert({ brewery_id: ctx.breweryId, user_id: userId, role: i.role });
    if (error) throw new CommandError(error.message);

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
    const { data: customer, error: customerError } = await ctx.db
      .from("customers")
      .select("id")
      .eq("id", i.customerId)
      .eq("brewery_id", ctx.breweryId)
      .maybeSingle();
    if (customerError) throw new CommandError(customerError.message);
    if (!customer) throw new CommandError(`customer not found: ${i.customerId}`);

    const userId = await inviteOrResolveUser(i.email);

    const adminClient = createAdminClient();
    const { data: existingMembership } = await adminClient
      .from("customer_users")
      .select("user_id")
      .eq("customer_id", i.customerId)
      .eq("user_id", userId)
      .maybeSingle();
    if (existingMembership) throw new CommandError(`${i.email} already has access to this customer`);

    const { error } = await adminClient
      .from("customer_users")
      .insert({ customer_id: i.customerId, user_id: userId });
    if (error) throw new CommandError(error.message);

    return { userId };
  },
});
