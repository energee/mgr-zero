// app/(auth)/password/page.tsx — Set new password (staff) and Portal set
// password: the recovery-token landing (auth/confirm) and the Me sheet's
// Change password. Needs a session, except for the Password saved outcome
// (?saved=1 plus savePassword's cookie), which must survive sign-out.
// Membership, never the person, decides where Save goes: a buyer's links and
// sign-in stay on portal pages. Distinct from joining a brewery: no role, no “Join”.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { E } from "@/components/mgr/e";
import { EntrySurface } from "@/components/mgr/entry-surface";
import { EntryView } from "@/components/mgr/views/entry";
import { passwordReturnHref, toPasswordSavedViewProps, toSetPasswordViewProps } from "@/lib/mgr/entry-view";
import { MgrIcon } from "@/components/mgr-icon";
import { hasRecentRecovery, PASSWORD_SAVED_COOKIE, signInPath } from "@/lib/auth/password";
import { createRequestAuthContext, homePath } from "@/lib/auth/request-context";
import { createServerClient } from "@/lib/supabase/server";
import { endPasswordSessions, savePassword } from "../actions";

export const metadata = { title: "Change password" };

export default async function PasswordPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string; saved?: string; portal?: string }> }) {
  const db = await createServerClient();
  const [{ error, next, saved, portal }, { data: { user } }, { data: verified, error: claimsError }, cookieStore] = await Promise.all([
    searchParams, db.auth.getUser(), db.auth.getClaims(), cookies(),
  ]);
  // Local/global signOut clears cookies even on some provider failures. The
  // already-saved result must not require the session it just attempted to end.
  if (saved === "1" && cookieStore.has(PASSWORD_SAVED_COOKIE)) {
    return <EntrySurface>
      {E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>)}
      <EntryView model={toPasswordSavedViewProps(error, !!user)} primaryHref={user ? null : signInPath(portal === "1")} extraAction={user ? endPasswordSessions : undefined} />
    </EntrySurface>;
  }
  if (!user) redirect("/reset?expired=1");
  const recovery = !claimsError && hasRecentRecovery(verified?.claims ?? null, user.id);
  const buyer = (await homePath(createRequestAuthContext(() => Promise.resolve(db)))) === "/portal";
  const model = toSetPasswordViewProps(user.email ?? "signed in", error, recovery);
  const backHref = passwordReturnHref(next ?? (buyer ? "/portal" : "/"));
  return <EntrySurface>
    {E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>)}
    <EntryView model={model} action={savePassword} linkHref={buyer ? "/reset?portal=1" : "/reset"} secondaryHref={backHref} hidden={<input type="hidden" name="next" value={backHref} />} />
  </EntrySurface>;
}
