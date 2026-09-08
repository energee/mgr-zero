// app/(auth)/actions.ts — login, logout, password recovery and the brewery
// switch stay outside the membership-based command endpoint: they are the
// Supabase Auth platform boundary (screen records Sign in, Reset password,
// Set new password, Me). Login reuses the newly signed-in client for its one
// post-login identity and membership composition.
"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createRequestAuthContext } from "@/lib/auth/request-context";
import { createServerClient } from "@/lib/supabase/server";

/** Where a signed-in account belongs: staff on Today, a buyer in the portal. */
async function home(db: Awaited<ReturnType<typeof createServerClient>>) {
  const auth = createRequestAuthContext(() => Promise.resolve(db));
  if (!(await auth.getIdentity())) return "/login?error=1";
  if ((await auth.getStaffMemberships()).length) return "/";
  if ((await auth.getCustomerMemberships()).length) return "/portal";
  return "/no-membership";
}

export async function login(form: FormData) {
  const db = await createServerClient();
  const { error } = await db.auth.signInWithPassword({
    email: String(form.get("email")),
    password: String(form.get("password")),
  });
  const back = form.get("portal") ? "/portal/login" : "/login";
  if (error) redirect(`${back}?error=1`);
  redirect(await home(db));
}

export async function logout() {
  const db = await createServerClient();
  await db.auth.signOut();
  redirect("/login");
}

/** Reset password / Portal forgot password: never confirms whether the email exists. */
export async function sendReset(form: FormData) {
  const db = await createServerClient();
  const origin = (await headers()).get("origin") ?? "";
  await db.auth.resetPasswordForEmail(String(form.get("email")), { redirectTo: `${origin}/auth/confirm?next=/password` });
  redirect(`/reset?sent=1${form.get("portal") ? "&portal=1" : ""}`);
}

/** Set new password / Portal set password: for the signed-in session (a recovery link or the Me sheet). */
export async function savePassword(form: FormData) {
  const db = await createServerClient();
  const { error } = await db.auth.updateUser({ password: String(form.get("password")) });
  if (error) redirect(`/password?error=${encodeURIComponent(error.message)}`);
  redirect(await home(db));
}

/** Me: operate as another of the caller's breweries. lib/brewery.ts reads the cookie. */
export async function switchBrewery(form: FormData) {
  (await cookies()).set("brewery", String(form.get("breweryId")), { path: "/", sameSite: "lax" });
  redirect("/");
}
