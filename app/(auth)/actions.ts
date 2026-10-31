// app/(auth)/actions.ts — login, logout, password recovery and the brewery
// switch stay outside the membership-based command endpoint: they are the
// Supabase Auth platform boundary (screen records Sign in, Reset password,
// Set new password, Me). Login reuses the newly signed-in client for its one
// post-login identity and membership composition.
"use server";

import "@/lib/commands/all";
import { buildContext } from "@/lib/commands/context";
import { runCommand, CommandError } from "@/lib/commands/registry";
import { z } from "zod";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createRequestAuthContext, homePath } from "@/lib/auth/request-context";
import { acceptInviteErrorPath, inviteAudience, inviteLanding, signInDestination } from "@/lib/auth/invite";
import { passwordReturnHref } from "@/lib/mgr/entry-view";
import { hasRecentRecovery, PASSWORD_SAVED_COOKIE, passwordChangeErrors, signInPath } from "@/lib/auth/password";
import { createServerClient, verifyCurrentPassword } from "@/lib/supabase/server";
import { readAppUrl } from "@/lib/env/server-parser";

export type LoginState = { email?: string; error?: string };
export type ResetState = LoginState & { sent?: boolean };

/** The brewery and customer selection cookies share these options. */
const SELECTION_COOKIE = { path: "/", sameSite: "lax" } as const;

export async function login(_previous: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "");
  const failure = { email, error: "Incorrect email or password." };
  const db = await createServerClient();
  const { error } = await db.auth.signInWithPassword({
    email,
    password: String(form.get("password")),
  });
  if (error) return failure;
  const auth = createRequestAuthContext(() => Promise.resolve(db));
  const identity = await auth.getIdentity();
  if (!identity) return failure;
  const next = form.get("next");
  redirect(await signInDestination(auth, typeof next === "string" ? next : undefined));
}

/** Passwordless sign-in validates email even when browser validation is unavailable. */
export async function emailLogin(form: FormData) {
  const next = form.get("next");
  const destination = passwordReturnHref(typeof next === "string" ? next : undefined);
  const returnQuery = typeof next === "string" ? `&${new URLSearchParams({ next: destination })}` : "";
  const email = z.string().email().safeParse(form.get("email"));
  if (!email.success) redirect(`/login?error=email${returnQuery}`);
  const db = await createServerClient();
  const origin = new URL(readAppUrl()).origin;
  await db.auth.signInWithOtp({
    email: email.data,
    options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/confirm?${new URLSearchParams({ next: destination })}` },
  });
  redirect(`/login?sent=1${returnQuery}`);
}

export async function logout() {
  const db = await createServerClient();
  await db.auth.signOut();
  redirect("/login");
}

/** Reset password / Portal forgot password: never confirms whether the email exists. */
export async function sendReset(_previous: ResetState, form: FormData): Promise<ResetState> {
  const email = String(form.get("email") ?? "");
  const db = await createServerClient();
  const origin = new URL(readAppUrl()).origin;
  const next = form.get("portal") ? "/password?portal=1" : "/password";
  const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/confirm?${new URLSearchParams({ next })}` });
  if (error) return { email, error: "The reset link could not be requested. Try again." };
  return { email, sent: true };
}

/** Changing a password requires current credentials or an Auth-verified recovery grant. */
export async function savePassword(form: FormData) {
  const db = await createServerClient();
  const next = form.get("next");
  const returnQuery = typeof next === "string" ? `&${new URLSearchParams({ next: passwordReturnHref(next) })}` : "";
  const { data: { user }, error: identityError } = await db.auth.getUser();
  if (identityError || !user) redirect("/reset?expired=1");
  const { data: verified, error: claimsError } = await db.auth.getClaims();
  const recovery = !claimsError && hasRecentRecovery(verified?.claims ?? null, user.id);
  const fields = {
    currentPassword: String(form.get("currentPassword") ?? ""),
    password: String(form.get("password") ?? ""),
    confirmPassword: String(form.get("confirmPassword") ?? ""),
  };
  const errors = passwordChangeErrors(fields, recovery);
  const invalid = Object.keys(errors)[0];
  if (invalid) redirect(`/password?error=${invalid}${returnQuery}`);
  if (!recovery) {
    // A password is checked against the account's email; without one there is nothing to check.
    if (!user.email) redirect(`/password?error=reauth_failed${returnQuery}`);
    // Use the server-verified account, never an email or recovery flag from the form.
    const reauthError = await verifyCurrentPassword(user.email, fields.currentPassword, user.id);
    if (reauthError) redirect(`/password?error=${reauthError === "invalid_credentials" ? "wrong_current" : "reauth_failed"}${returnQuery}`);
  }
  const { error } = await db.auth.updateUser({
    password: fields.password,
    ...(!recovery ? { current_password: fields.currentPassword } : {}),
  });
  if (error) redirect(`/password?error=${encodeURIComponent(error.code ?? "1")}${returnQuery}`);
  // Read while the session still exists: a buyer signs in again on the portal's page.
  const destination = await homePath(createRequestAuthContext(() => Promise.resolve(db)));
  const portal = destination === "/portal";
  // Only a real save opens Password saved: the page requires this cookie, so a crafted
  // `?saved=1` link cannot claim a password changed. Auth sign-out does not clear it.
  (await cookies()).set(PASSWORD_SAVED_COOKIE, "1", { path: "/password", maxAge: 600, httpOnly: true, sameSite: "lax" });
  const { error: revokeError } = await db.auth.signOut({ scope: "others" });
  // The password has already changed: never ask the user to resubmit it on a revocation failure.
  if (revokeError) redirect(`${savedPath(portal, "revoke_failed")}${returnQuery}`);
  if (recovery) {
    const { error: signOutError } = await db.auth.signOut({ scope: "local" });
    if (signOutError) redirect(`${savedPath(portal, "signout_failed")}${returnQuery}`);
    redirect(signInPath(portal));
  }
  redirect(destination);
}

/** Explicit recovery when password saved but session revocation failed. */
export async function endPasswordSessions() {
  const db = await createServerClient();
  const { data: { user }, error: identityError } = await db.auth.getUser();
  if (identityError || !user) redirect(savedPath(false, "revoke_failed"));
  const portal = (await homePath(createRequestAuthContext(() => Promise.resolve(db)))) === "/portal";
  const { error } = await db.auth.signOut({ scope: "global" });
  if (error) redirect(savedPath(portal, "revoke_failed"));
  redirect(signInPath(portal));
}

/** The Password saved outcome; `portal` only picks which sign-in page it links to. */
function savedPath(portal: boolean, error: string) {
  return `/password?saved=1${portal ? "&portal=1" : ""}&error=${error}`;
}

export async function acceptInvite(form: FormData) {
  const audience = inviteAudience(form.get("audience"));
  const name = String(form.get("name") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!audience || !name || password.length < 8) redirect(acceptInviteErrorPath(audience, name));

  const db = await createServerClient();
  const auth = createRequestAuthContext(() => Promise.resolve(db));
  const { data } = await db.auth.getUser();
  if (data.user?.user_metadata?.mgr_invite_kind !== audience || data.user.user_metadata.mgr_invite_accepted || !(await inviteLanding(auth, audience))) {
    redirect("/invite-expired");
  }
  const { error } = await db.auth.updateUser({ password, data: { name, mgr_invite_accepted: true } });
  if (error) redirect(`/accept?audience=${audience}&error=1`);
  redirect(audience === "staff" ? "/" : "/portal");
}

/** Me: operate as another of the caller's breweries. lib/brewery.ts reads the cookie. */
export async function switchBrewery(form: FormData) {
  (await cookies()).set("brewery", String(form.get("breweryId")), SELECTION_COOKIE);
  redirect("/");
}

/** The invitation id is also the stable acceptance request id across reloads. */
export async function acceptAccountInvitation(form: FormData) {
  const inviteId = String(form.get("inviteId") ?? "");
  type Accepted = { breweryId: string; kind: string; customerId: string | null };
  let result: Accepted;
  try {
    result = await runCommand("accept_account_invitation", { inviteId }, await buildContext(), {
      requestId: inviteId, correlationId: crypto.randomUUID(),
    }) as Accepted;
  } catch (error) {
    if (!(error instanceof CommandError)) throw error;
    redirect("/invitations?error=1");
  }
  const jar = await cookies();
  if (result.kind === "staff") jar.set("brewery", result.breweryId, SELECTION_COOKIE);
  if (result.customerId) jar.set("customer", result.customerId, SELECTION_COOKIE);
  redirect(result.kind === "staff" ? "/" : "/portal");
}

export async function switchCustomer(form: FormData) {
  const customerId = String(form.get("customerId") ?? "");
  const auth = createRequestAuthContext();
  if (!(await auth.getCustomerMemberships()).some(m => m.customerId === customerId)) {
    throw new CommandError("permission denied", 403, "permission_denied");
  }
  (await cookies()).set("customer", customerId, SELECTION_COOKIE);
  redirect("/portal");
}
