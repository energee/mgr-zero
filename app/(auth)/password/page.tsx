// app/(auth)/password/page.tsx — Set new password (staff) and Portal set
// password: the recovery-token landing (auth/confirm) and the Me sheet's
// Change password. Needs a session; membership, never the person, decides
// the shell after Save. Distinct from joining a brewery: no role, no “Join”.
import { redirect } from "next/navigation";
import { E } from "@/components/mgr/e";
import { EntrySurface } from "@/components/mgr/entry-surface";
import { EntryView } from "@/components/mgr/views/entry";
import { toPasswordSavedViewProps, toSetPasswordViewProps } from "@/lib/mgr/entry-view";
import { MgrIcon } from "@/components/mgr-icon";
import { hasRecentRecovery } from "@/lib/auth/password";
import { createServerClient } from "@/lib/supabase/server";
import { endPasswordSessions, savePassword } from "../actions";

export default async function PasswordPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const db = await createServerClient();
  const [{ error, saved }, { data: { user } }, { data: verified, error: claimsError }] = await Promise.all([
    searchParams, db.auth.getUser(), db.auth.getClaims(),
  ]);
  // Local/global signOut clears cookies even on some provider failures. The
  // already-saved result must not require the session it just attempted to end.
  if (saved === "1") {
    return <EntrySurface>
      {E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>)}
      <EntryView model={toPasswordSavedViewProps(error, !!user)} primaryHref="/login" extraAction={user ? endPasswordSessions : undefined} />
    </EntrySurface>;
  }
  if (!user) redirect("/reset?expired=1");
  const recovery = !claimsError && hasRecentRecovery(verified?.claims ?? null, user.id);
  const model = toSetPasswordViewProps(user.email ?? "signed in", error, recovery);
  return <EntrySurface>
    {E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>)}
    <EntryView model={model} action={savePassword} linkHref="/reset" />
  </EntrySurface>;
}
