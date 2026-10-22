// app/(auth)/no-membership/page.tsx — No membership and Portal staff only
// (screen records). A login on no brewery and no customer sees No brewery yet.
// A staff login on no customer account only lands here from the portal: any
// portal page (the portal layout runs getActiveCustomer in lib/portal.ts) or
// the invoice pay route. So it is told the portal is for customers and offered
// Today. An account with a customer membership is sent
// home instead, so a customer-only login never sees this page.
import { getServerEnv } from "@/lib/env/server";
import { redirect } from "next/navigation";
import { E } from "@/components/mgr/e";
import { EntrySurface } from "@/components/mgr/entry-surface";
import { EntryView } from "@/components/mgr/views/entry";
import { noMembershipModel, portalStaffOnlyModel } from "@/lib/mgr/entry-view";
import { MgrIcon } from "@/components/mgr-icon";
import { getCustomerMemberships, getRequestIdentity, getStaffMemberships } from "@/lib/auth/request-context";
import { logout } from "../actions";

export default async function NoMembershipPage() {
  if (!(await getRequestIdentity())) redirect("/login");
  const createBreweryHref = getServerEnv().dedicated ? null : "/create-brewery";
  const staff = (await getStaffMemberships()).length > 0;
  if ((await getCustomerMemberships()).length) redirect(staff ? "/" : "/portal");
  return <EntrySurface>
    {E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>)}
    <EntryView
      model={staff ? portalStaffOnlyModel : noMembershipModel}
      primaryHref={staff ? "/" : createBreweryHref}
      extraAction={logout}
    />
  </EntrySurface>;
}
