// app/(auth)/actions.ts — the login server action. Deliberately NOT a
// command: no session exists yet, so the command endpoint's membership-based
// Ctx can't be built. This is the one server-action mutation in the app and
// the one place errors travel via a query param instead of inline state.
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
  redirect("/");
}
