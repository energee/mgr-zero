// lib/brewery.ts — resolves which brewery this request operates as.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getRequestIdentity, getStaffMemberships } from "@/lib/auth/request-context";

export async function getActiveBrewery() {
  if (!(await getRequestIdentity())) redirect("/login");

  const memberships = await getStaffMemberships();
  if (!memberships.length) redirect("/login?error=no-membership");

  const picked = (await cookies()).get("brewery")?.value;
  const membership = memberships.find(({ breweryId }) => breweryId === picked) ?? memberships[0];
  return { id: membership.breweryId, name: membership.breweryName, role: membership.role };
}
