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
