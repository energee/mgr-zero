// app/(auth)/actions.ts — login, logout, password recovery and the brewery
// switch stay outside the membership-based command endpoint: they are the
// Supabase Auth platform boundary (screen records Sign in, Reset password,
// Set new password, Me). Login reuses the newly signed-in client for its one
// post-login identity and membership composition.
"use server";

import "@/lib/commands/all";
import { buildContext } from "@/lib/commands/context";
import { runCommand, CommandError } from "@/lib/commands/registry";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createRequestAuthContext } from "@/lib/auth/request-context";
import { acceptInviteErrorPath, hasPendingInvitations, inviteAudience, inviteLanding } from "@/lib/auth/invite";
import { createServerClient } from "@/lib/supabase/server";

/** The brewery and customer selection cookies share these options. */
const SELECTION_COOKIE = { path: "/", sameSite: "lax" } as const;

/** Where a signed-in account belongs: staff on Today, a buyer in the portal. */
async function home(auth: ReturnType<typeof createRequestAuthContext>) {
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
  const auth = createRequestAuthContext(() => Promise.resolve(db));
  const identity = await auth.getIdentity();
  if (!identity) redirect(`${back}?error=1`);
  const [pending, destination] = await Promise.all([hasPendingInvitations(db, identity.userId), home(auth)]);
  redirect(pending ? "/invitations" : destination);
}

/** Passwordless sign-in: the shared staff entry view's secondary action. */
export async function emailLogin(form: FormData) {
  const db = await createServerClient();
  const origin = (await headers()).get("origin") ?? "";
  await db.auth.signInWithOtp({
    email: String(form.get("email")),
    options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/confirm?next=/` },
  });
  redirect("/login?sent=1");
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
  // The code, never the message: the page maps it to fixed text (toSetPasswordViewProps).
  if (error) redirect(`/password?error=${encodeURIComponent(error.code ?? "1")}`);
  redirect(await home(createRequestAuthContext(() => Promise.resolve(db))));
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
