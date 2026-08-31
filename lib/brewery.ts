// lib/brewery.ts — resolves which brewery this session operates as.
// React.cache dedupes the auth + membership round-trip across the layout and
// the page rendering in the same request.
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";

interface BreweryMembership {
  brewery_id: string;
  role: string;
  breweries: {
    name: string;
  };
}

export const getActiveBrewery = cache(async () => {
  const db = await createServerClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  const { data: memberships } = await db
    .from("brewery_users")
    .select("brewery_id, role, breweries!inner(name)")
    .eq("user_id", user!.id)
    .returns<BreweryMembership[]>();
  if (!memberships?.length) redirect("/login?error=no-membership");
  const picked = (await cookies()).get("brewery")?.value;
  const m = memberships!.find(x => x.brewery_id === picked) ?? memberships![0];
  return { id: m.brewery_id, name: m.breweries.name, role: m.role };
});
