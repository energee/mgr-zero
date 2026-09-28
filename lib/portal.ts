// lib/portal.ts — resolves which customer account this request operates as.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCustomerMemberships, getRequestIdentity, type CustomerMembership } from "@/lib/auth/request-context";

export async function getActiveCustomer() {
  if (!(await getRequestIdentity())) redirect("/login");

  const memberships = await getCustomerMemberships();
  if (!memberships.length) redirect("/no-membership");

  const picked = (await cookies()).get("customer")?.value;
  const membership = selectCustomerMembership(memberships, picked);
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
