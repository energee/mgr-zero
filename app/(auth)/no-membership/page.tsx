// app/(auth)/no-membership/page.tsx — No membership (screen record): signed
// in, but this account is on no brewery and no customer. An account that does
// belong somewhere is sent there instead, so a customer-only login never
// sees it by landing on a staff route.
import Link from "next/link";
import { serverEnv } from "@/lib/env/server";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { E } from "@/components/mgr/e";
import { getCustomerMemberships, getRequestIdentity, getStaffMemberships } from "@/lib/auth/request-context";
import { logout } from "../actions";
import { Entry } from "../entry";

export default async function NoMembershipPage() {
  if (!(await getRequestIdentity())) redirect("/login");
  if ((await getStaffMemberships()).length) redirect("/");
  if ((await getCustomerMemberships()).length) redirect("/portal");
  return (
    <Entry title="No brewery yet">
      {E.note("This login is not on a brewery or a customer account.")}
      {E.info("Contact your brewery administrator about access.")}
      {!serverEnv.dedicated && <Link href="/create-brewery" className="text-sm underline">Create brewery</Link>}
      <form action={logout}><Button type="submit" variant="outline" className="w-full">Sign out</Button></form>
    </Entry>
  );
}
