// lib/portal.ts — resolves which customer account this request operates as.
import { redirect } from "next/navigation";
import { getCustomerMemberships, getRequestIdentity } from "@/lib/auth/request-context";

export async function getActiveCustomer() {
  if (!(await getRequestIdentity())) redirect("/login");

  const memberships = await getCustomerMemberships();
  if (!memberships.length) redirect("/login?error=no-membership");

  const membership = memberships[0];
  return {
    customerId: membership.customerId,
    breweryId: membership.breweryId,
    customerName: membership.customerName,
  };
}
