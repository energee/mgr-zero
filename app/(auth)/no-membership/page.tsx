// app/(auth)/no-membership/page.tsx — No membership (screen record): signed
// in, but this account is on no brewery and no customer. An account that does
// belong somewhere is sent there instead, so a customer-only login never
// sees it by landing on a staff route.
import { getServerEnv } from "@/lib/env/server";
import { redirect } from "next/navigation";
import { E } from "@/components/mgr/e";
import { EntrySurface } from "@/components/mgr/entry-surface";
import { EntryView } from "@/components/mgr/views/entry";
import { noMembership } from "@/lib/mgr/fixtures/entry";
import { MgrIcon } from "@/components/mgr-icon";
import { getCustomerMemberships, getRequestIdentity, getStaffMemberships } from "@/lib/auth/request-context";
import { logout } from "../actions";

export default async function NoMembershipPage() {
  if (!(await getRequestIdentity())) redirect("/login");
  const serverEnv = getServerEnv();
  if ((await getStaffMemberships()).length) redirect("/");
  if ((await getCustomerMemberships()).length) redirect("/portal");
  return <EntrySurface>
    {E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>)}
    <EntryView
      model={noMembership}
      primaryHref={serverEnv.dedicated ? null : "/create-brewery"}
      extraAction={logout}
    />
  </EntrySurface>;
}
