// app/(auth)/password/page.tsx — Set new password (staff) and Portal set
// password: the recovery-token landing (auth/confirm) and the Me sheet's
// Change password. Needs a session; membership, never the person, decides
// the shell after Save. Distinct from joining a brewery: no role, no “Join”.
import { redirect } from "next/navigation";
import { E } from "@/components/mgr/e";
import { EntrySurface } from "@/components/mgr/entry-surface";
import { EntryView } from "@/components/mgr/views/entry";
import { passwordReturnHref, toSetPasswordViewProps } from "@/lib/mgr/entry-view";
import { MgrIcon } from "@/components/mgr-icon";
import { getCustomerMemberships, getRequestIdentity, getStaffMemberships } from "@/lib/auth/request-context";
import { savePassword } from "../actions";

export const metadata = { title: "Change password" };

export default async function PasswordPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const [{ error, next }, identity] = await Promise.all([searchParams, getRequestIdentity()]);
  if (!identity) redirect("/reset?expired=1");
  const model = toSetPasswordViewProps(identity.email ?? "signed in", error);
  let backHref = passwordReturnHref(next);
  if (!next && !(await getStaffMemberships()).length && (await getCustomerMemberships()).length) backHref = "/portal";
  return <EntrySurface>
    {E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>)}
    <EntryView model={model} action={savePassword} secondaryHref={backHref} hidden={next ? <input type="hidden" name="next" value={backHref} /> : undefined} />
  </EntrySurface>;
}
