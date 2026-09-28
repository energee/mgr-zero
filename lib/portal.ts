// lib/portal.ts — resolves which customer account this request operates as.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCustomerMemberships, getRequestIdentity, type CustomerMembership } from "@/lib/auth/request-context";
import { buildContext } from "@/lib/commands/context";

export async function getActiveCustomer() {
  if (!(await getRequestIdentity())) redirect("/login");

  const memberships = await getCustomerMemberships();
  if (!memberships.length) redirect("/no-membership");

  const membership = selectCustomerMembership(memberships, await pickedCustomerId());
  return {
    customerId: membership.customerId,
    breweryId: membership.breweryId,
    breweryName: membership.breweryName,
    customerName: membership.customerName,
  };
}

/** A remembered selection can choose only among the caller's current memberships. */
export function selectCustomerMembership(memberships: CustomerMembership[], picked?: string) {
  return memberships.find(m => m.customerId === picked) ?? memberships[0];
}

/** The customer account the buyer last chose (Portal account switcher); unverified until matched. */
export async function pickedCustomerId() {
  return (await cookies()).get("customer")?.value;
}

/** The active customer plus a command context scoped to it, for portal pages. */
export async function getPortalContext() {
  const customer = await getActiveCustomer();
  return { customer, ctx: await buildContext(customer.breweryId, customer.customerId) };
}
