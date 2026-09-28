import "@/lib/commands/all";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RequestAuthContext } from "@/lib/auth/request-context";
import { runCommand } from "@/lib/commands/registry";
import type { Database } from "@/lib/supabase/database";

export type InviteAudience = "staff" | "customer";

export function inviteAudience(value: unknown): InviteAudience | null {
  return value === "staff" || value === "customer" ? value : null;
}

export function safeNextUrl(requestUrl: string, wanted: string | null) {
  const fallback = new URL("/password", requestUrl).href;
  if (!wanted) return fallback;
  const request = new URL(requestUrl);
  try {
    const destination = new URL(wanted, request.origin);
    return destination.origin === request.origin ? destination.href : fallback;
  } catch {
    return fallback;
  }
}

export function acceptInviteErrorPath(audience: InviteAudience | null, name: string) {
  if (!audience) return "/invite-expired";
  const query = new URLSearchParams({ audience, error: "1" });
  if (name) query.set("name", name);
  return `/accept?${query}`;
}

export async function inviteLanding(auth: RequestAuthContext, audience: InviteAudience) {
  const identity = await auth.getIdentity();
  if (!identity) return null;

  if (audience === "staff") {
    const [membership] = await auth.getStaffMemberships();
    return membership && { audience, name: membership.breweryName, role: membership.role, email: identity.email };
  }

  const [membership] = await auth.getCustomerMemberships();
  return membership && { audience, name: membership.breweryName, role: "customer", email: identity.email };
}

/** Sign-in landings send an account with consent invitations waiting to /invitations first. */
export async function hasPendingInvitations(db: SupabaseClient<Database>, userId: string) {
  const pending = await runCommand("list_my_invitations", {}, { db, userId, breweryId: null, role: null }) as unknown[];
  return pending.length > 0;
}
