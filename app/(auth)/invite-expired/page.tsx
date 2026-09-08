import Link from "next/link";
import { Button } from "@/components/ui/button";
import { E } from "@/components/mgr/e";
import { Entry } from "../entry";

export default function InviteExpiredPage() {
  return <Entry title="Invite expired">
    {E.note("This invite is no longer valid.")}
    {E.info("Set a password through account recovery, or sign in if you already accepted this invite.")}
    <Button asChild><Link href="/reset">Reset password</Link></Button>
    <Button variant="outline" asChild><Link href="/login">Back to sign in</Link></Button>
  </Entry>;
}
