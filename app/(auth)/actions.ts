// app/(auth)/actions.ts — the login server action, plus sign-out. Deliberately
// NOT commands: no session exists yet (login) or none should remain
// (logout), so the command endpoint's membership-based Ctx can't be built.
// login is the one server-action mutation with errors traveling via a query
// param instead of inline state. After sign-in, staff (brewery_users row)
// land on "/"; portal-only accounts (customer_users row, no brewery_users
// row) land on "/portal".
"use server";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";

export async function login(form: FormData) {
  const db = await createServerClient();
  const { error } = await db.auth.signInWithPassword({
    email: String(form.get("email")),
    password: String(form.get("password")),
  });
  if (error) redirect("/login?error=1");
  const { data: { user } } = await db.auth.getUser();
  const { count: staffCount } = await db.from("brewery_users").select("*", { count: "exact", head: true }).eq("user_id", user!.id);
  if (!staffCount) {
    const { count: customerCount } = await db.from("customer_users").select("*", { count: "exact", head: true }).eq("user_id", user!.id);
    if (customerCount) redirect("/portal");
  }
  redirect("/");
}

export async function logout() {
  const db = await createServerClient();
  await db.auth.signOut();
  redirect("/login");
}
