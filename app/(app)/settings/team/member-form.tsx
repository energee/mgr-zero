"use client";
import { useState } from "react";
import { CommandForm } from "@/components/mgr/command-form";
import { TeamMemberView } from "@/components/mgr/views/team-controls";
import { TeamRosterRowView } from "@/components/mgr/views/team";
import { useCommandForm } from "@/lib/commands/use-command-form";
import type { TeamMember } from "@/lib/commands/invites";
import { STAFF_ROLES } from "@/lib/mgr/enums";
import { sentenceCase } from "@/lib/mgr/labels";

export function MemberForm({ member }: { member: TeamMember }) {
  const [roles, setRoles] = useState(member.roles);
  const form = useCommandForm("update_staff_role", { build: () => ({ userId: member.userId, roles }), reset: () => setRoles(member.roles), target: member.userId });
  return <CommandForm open={form.open} onOpenChange={open => { if (!form.busy) form.setOpen(open); }} title="Team member" trigger={<button type="button" className="w-full text-left"><TeamRosterRowView row={{ key: member.userId, title: member.handle, detail: `${member.email} · ${STAFF_ROLES.filter(role => member.roles.includes(role)).map(sentenceCase).join(", ")}` }} /></button>}>
    <TeamMemberView name={member.handle} email={member.email} savedRoles={member.roles} roles={roles} onRolesChange={setRoles} onSubmit={form.submit}
      saving={form.submitting} removing={form.busy && !form.submitting} error={form.error}
      onRemove={() => form.run("revoke_staff", { userId: member.userId }, () => form.setOpen(false), { target: member.userId })} />
  </CommandForm>;
}
