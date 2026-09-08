import Link from "next/link";
import { Button } from "@/components/ui/button";
import { E } from "@/components/mgr/e";
import { Entry } from "../entry";

export default function InviteExpiredPage() {
  return <Entry title="Invite expired">
    {E.note("This invite is no longer valid.")}
    {E.info("Ask an admin to send a new one, or sign in if you already accepted it.")}
    <Button asChild><Link href="/login">Back to sign in</Link></Button>
  </Entry>;
}
