// lib/commands/context.ts — resolves the caller's membership into a Ctx. Throws if not a member.
import { createServerClient } from "@/lib/supabase/server";
import { CommandError } from "./registry";
import type { Ctx } from "./registry";

export async function buildContext(breweryId: string): Promise<Ctx> {
  const db = await createServerClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new CommandError("unauthenticated");
  const { data: staff } = await db.from("brewery_users").select("role").eq("brewery_id", breweryId).eq("user_id", user.id).maybeSingle();
  if (staff) return { db, userId: user.id, breweryId, role: staff.role };
  const { data: cust } = await db.from("customer_users").select("customer_id, customers!inner(brewery_id)").eq("user_id", user.id);
  if (cust?.some((r: any) => r.customers.brewery_id === breweryId)) return { db, userId: user.id, breweryId, role: "customer" };
  throw new CommandError("not a member of this brewery");
}
