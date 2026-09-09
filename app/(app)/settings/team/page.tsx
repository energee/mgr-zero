import { redirect } from "next/navigation";
import { E } from "@/components/mgr/e";
import { TeamView } from "@/components/mgr/views/team";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import type { TeamMember } from "@/lib/commands/invites";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { getRequestIdentity } from "@/lib/auth/request-context";
import { deniedHref } from "@/lib/mgr/denied";
import { toTeamViewProps } from "@/lib/mgr/team-view";
import "@/lib/commands/all";
import { InviteForm } from "./invite-form";
import { MemberForm } from "./member-form";

export default async function TeamPage() {
  const [brewery, identity] = await Promise.all([getActiveBrewery(), getRequestIdentity()]);
  if (brewery.role !== "admin") redirect(deniedHref("Team", ["admin"]));
  const members = (await runCommand("list_team_members", {}, await buildContext(brewery.id))) as TeamMember[];
  return (
    <TeamView
      model={toTeamViewProps({
        backHref: "/settings",
        rows: members.map((m) => ({
          key: m.userId,
          title: m.handle,
          detail: `${m.email} · ${m.role}`,
          you: m.userId === identity?.userId,
        })),
      })}
      rows={members.map((m) => m.userId === identity?.userId
        ? <div key={m.userId}>{E.row(m.handle, `${m.email} · ${m.role}`, "you")}</div>
        : <MemberForm key={m.userId} member={m} />)}
      createAction={<InviteForm />}
    />
  );
}
