// app/(auth)/actions.ts — login and logout stay outside the membership-based
// command endpoint. Login reuses the newly signed-in client for its one
// post-login identity and membership composition.
"use server";

import { redirect } from "next/navigation";
import { createRequestAuthContext } from "@/lib/auth/request-context";
import { createServerClient } from "@/lib/supabase/server";

export async function login(form: FormData) {
  const db = await createServerClient();
  const { error } = await db.auth.signInWithPassword({
    email: String(form.get("email")),
    password: String(form.get("password")),
  });
  if (error) redirect("/login?error=1");

  const auth = createRequestAuthContext(() => Promise.resolve(db));
  if (!(await auth.getIdentity())) redirect("/login?error=1");
  if ((await auth.getStaffMemberships()).length) redirect("/");
  if ((await auth.getCustomerMemberships()).length) redirect("/portal");
  redirect("/");
}

export async function logout() {
  const db = await createServerClient();
  await db.auth.signOut();
  redirect("/login");
}
