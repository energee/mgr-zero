// lib/brewery.ts — resolves which brewery this request operates as.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getRequestIdentity, getStaffMemberships } from "@/lib/auth/request-context";
import { buildContext } from "@/lib/commands/context";
import { deniedHref } from "@/lib/mgr/denied";

export async function getActiveBrewery() {
  if (!(await getRequestIdentity())) redirect("/login");

  const memberships = await getStaffMemberships();
  if (!memberships.length) redirect("/no-membership");

  const picked = (await cookies()).get("brewery")?.value;
  const membership = memberships.find(({ breweryId }) => breweryId === picked) ?? memberships[0];
  return { id: membership.breweryId, name: membership.breweryName, role: membership.role };
}

export async function requireAdminContext(label: string) {
  const brewery = await getActiveBrewery();
  if (brewery.role !== "admin") redirect(deniedHref(label, ["admin"]));
  return { brewery, ctx: await buildContext(brewery.id) };
}
