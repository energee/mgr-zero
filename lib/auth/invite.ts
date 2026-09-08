import type { RequestAuthContext } from "@/lib/auth/request-context";

export type InviteAudience = "staff" | "customer";

export function inviteAudience(value: unknown): InviteAudience | null {
  return value === "staff" || value === "customer" ? value : null;
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
