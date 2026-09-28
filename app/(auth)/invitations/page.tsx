import { redirect } from "next/navigation";
import { getRequestIdentity } from "@/lib/auth/request-context";
import { EntrySurface } from "@/components/mgr/entry-surface";
import "@/lib/commands/all";
import { AccountInvitationsView } from "@/components/mgr/views/account-invitations";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import type { AccountInvitation } from "@/lib/mgr/account-invitations";
import { acceptAccountInvitation } from "../actions";

export default async function InvitationsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!(await getRequestIdentity())) redirect("/login");
  const { error } = await searchParams;
  const invitations = await runCommand("list_my_invitations", {}, await buildContext()) as AccountInvitation[];
  return <EntrySurface><AccountInvitationsView invitations={invitations} action={acceptAccountInvitation} continueHref="/"
    error={error ? "The invitation could not be accepted. Check that you are signed in with the invited email and ask the brewery if it expired or was revoked." : undefined} /></EntrySurface>;
}
