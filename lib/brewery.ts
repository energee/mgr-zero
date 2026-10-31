// lib/brewery.ts — resolves which brewery this request operates as.
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getRequestIdentity, getStaffMemberships } from "@/lib/auth/request-context";
import { buildContext } from "@/lib/commands/context";
import { deniedHref } from "@/lib/mgr/denied";
import { hasAnyRole } from "@/lib/mgr/roles";
import { passwordReturnHref } from "@/lib/mgr/entry-view";

/** The brewery this request operates as, with its time zone for formatting timestamps. */
export async function getActiveBrewery() {
  if (!(await getRequestIdentity())) {
    const next = passwordReturnHref((await headers()).get("x-mgr-path") ?? undefined);
    redirect(`/login?${new URLSearchParams({ next })}`);
  }

  const memberships = await getStaffMemberships();
  if (!memberships.length) redirect("/no-membership");

  const picked = (await cookies()).get("brewery")?.value;
  const membership = memberships.find(({ breweryId }) => breweryId === picked) ?? memberships[0];
  return {
    id: membership.breweryId, name: membership.breweryName, roles: membership.roles, timeZone: membership.timeZone,
    gravityUnit: membership.gravityUnit, myGravityUnit: membership.myGravityUnit,
  };
}

export async function requireAdminContext(label: string) {
  const brewery = await getActiveBrewery();
  if (!hasAnyRole(brewery.roles, ["admin"])) redirect(deniedHref(label, ["admin"]));
  return { brewery, ctx: await buildContext(brewery.id) };
}
