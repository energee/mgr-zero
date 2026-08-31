// lib/portal.ts — resolves which customer account this session operates as
// (mirrors lib/brewery.ts's getActiveBrewery). React.cache dedupes the auth +
// customer_users round-trip across the portal layout and page in one request.
import { cache } from "react";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";

interface CustomerMembership {
  customer_id: string;
  customers: {
    name: string;
    brewery_id: string;
  };
}

export const getActiveCustomer = cache(async () => {
  const db = await createServerClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  const { data: memberships } = await db
    .from("customer_users")
    .select("customer_id, customers!inner(name, brewery_id)")
    .eq("user_id", user!.id)
    .returns<CustomerMembership[]>();
  if (!memberships?.length) redirect("/login?error=no-membership");
  const m = memberships![0];
  return { customerId: m.customer_id, breweryId: m.customers.brewery_id, customerName: m.customers.name };
});
