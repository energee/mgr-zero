// app/(auth)/password/page.tsx — Set new password (staff) and Portal set
// password: the recovery-token landing (auth/confirm) and the Me sheet's
// Change password. Needs a session; membership, never the person, decides
// the shell after Save. Distinct from joining a brewery: no role, no “Join”.
import { redirect } from "next/navigation";
import { E } from "@/components/mgr/e";
import { EntrySurface } from "@/components/mgr/entry-surface";
import { EntryView } from "@/components/mgr/views/entry";
import { setPassword } from "@/lib/mgr/fixtures/entry";
import { MgrIcon } from "@/components/mgr-icon";
import { getRequestIdentity } from "@/lib/auth/request-context";
import { savePassword } from "../actions";

export default async function PasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ error }, identity] = await Promise.all([searchParams, getRequestIdentity()]);
  if (!identity) redirect("/reset?expired=1");
  const model = { ...setPassword, field: { ...setPassword.field!, value: identity.email ?? "signed in" }, note: error };
  return <EntrySurface>
    {E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>)}
    <EntryView model={model} action={savePassword} />
  </EntrySurface>;
}
