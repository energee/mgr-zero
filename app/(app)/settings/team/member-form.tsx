"use client";
import { useState } from "react";
import { CommandForm } from "@/components/mgr/command-form";
import { TeamMemberView } from "@/components/mgr/views/team-controls";
import { TeamRosterRowView } from "@/components/mgr/views/team";
import { useCommandForm } from "@/lib/commands/use-command-form";
import type { TeamMember } from "@/lib/commands/invites";
import { toTeamMemberRow } from "@/lib/mgr/team-view";

export function MemberForm({ member }: { member: TeamMember }) {
  const [roles, setRoles] = useState(member.roles);
  const form = useCommandForm("update_staff_role", { build: () => ({ userId: member.userId, roles }), reset: () => setRoles(member.roles), target: member.userId });
  return <CommandForm open={form.open} onOpenChange={open => { if (!form.busy) form.setOpen(open); }} title="Team member" trigger={<button type="button" className="w-full text-left"><TeamRosterRowView row={toTeamMemberRow(member)} /></button>}>
    <TeamMemberView name={member.name} savedRoles={member.roles} roles={roles} onRolesChange={setRoles} onSubmit={form.submit}
      saving={form.submitting} removing={form.busy && !form.submitting} error={form.error}
      onRemove={() => form.run("revoke_staff", { userId: member.userId }, () => form.setOpen(false), { target: member.userId })} />
  </CommandForm>;
}
