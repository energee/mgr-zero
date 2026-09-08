import type { RequestAuthContext } from "@/lib/auth/request-context";

export type InviteAudience = "staff" | "customer";

export function inviteAudience(value: unknown): InviteAudience | null {
  return value === "staff" || value === "customer" ? value : null;
}

export function safeNextUrl(requestUrl: string, wanted: string | null) {
  const fallback = new URL("/password", requestUrl).href;
  if (!wanted) return fallback;
  const request = new URL(requestUrl);
  const destination = new URL(wanted, request.origin);
  return destination.origin === request.origin ? destination.href : fallback;
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
