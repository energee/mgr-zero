// app/(app)/settings/team/page.tsx — Team (screen record): the roster as
// @handles from list_team_members, your own row marked "you", every other row
// opening the Team member sheet (member-form.tsx). Invite staff stays gated
// until Program 11 closes the invitation workflow gate (ARCHITECTURE.md).
import { redirect } from "next/navigation";
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import type { TeamMember } from "@/lib/commands/invites";
import { runCommand } from "@/lib/commands/registry";
import { getRequestIdentity } from "@/lib/auth/request-context";
import { deniedHref } from "@/lib/mgr/denied";
import "@/lib/commands/all";
import { MemberForm } from "./member-form";

export default async function TeamPage() {
  const [brewery, identity] = await Promise.all([getActiveBrewery(), getRequestIdentity()]);
  if (brewery.role !== "admin") redirect(deniedHref("Team", ["admin"]));
  const members = (await runCommand("list_team_members", {}, await buildContext(brewery.id))) as TeamMember[];
  const admins = members.filter((m) => m.role === "admin").length;
  return (
    <>
      {E.back("Settings", "Team", undefined, "/settings")}
      {members.map((m) => m.userId === identity?.userId
        ? <div key={m.userId}>{E.row(m.handle, `${m.email} · ${m.role}`, "you")}</div>
        : <MemberForm key={m.userId} member={m} lastAdmin={m.role === "admin" && admins === 1} />)}
      {E.gated("Invite staff", "invitations aren’t available yet")}
    </>
  );
}
