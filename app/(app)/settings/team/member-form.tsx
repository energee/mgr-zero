"use client";
import { useState } from "react";
import { CommandForm } from "@/components/mgr/command-form";
import { TeamMemberView } from "@/components/mgr/views/team-controls";
import { TeamRosterRowView } from "@/components/mgr/views/team";
import { useCommandAction, useCommandForm } from "@/lib/commands/use-command-form";
import type { TeamMember } from "@/lib/commands/invites";

export function MemberForm({ member }: { member: TeamMember }) {
  const [role, setRole] = useState(member.role);
  const form = useCommandForm("update_staff_role", { build: () => ({ userId: member.userId, role }), reset: () => setRole(member.role) });
  const remove = useCommandAction();
  return <CommandForm open={form.open} onOpenChange={open => { if (!form.submitting && !remove.busy) form.setOpen(open); }} title="Team member" trigger={<button type="button" className="w-full text-left"><TeamRosterRowView row={{ key: member.userId, title: member.handle, detail: `${member.email} · ${member.role}` }} /></button>}>
    <TeamMemberView name={member.handle} email={member.email} savedRole={member.role} role={role} onRoleChange={setRole} onSubmit={form.submit}
      saving={form.submitting} removing={remove.busy} error={form.error ?? remove.error}
      onRemove={() => void remove.run("revoke_staff", { userId: member.userId }, () => form.setOpen(false))} />
  </CommandForm>;
}
