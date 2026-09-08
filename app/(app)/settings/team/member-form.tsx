// app/(app)/settings/team/member-form.tsx — Team member (screen record): one
// member's role changed in one write (update_staff_role) and the membership
// ended in another (revoke_staff). Opened from a Team row; never drawn for
// the signed-in person, whose own row is the self state.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCommandAction, useCommandForm } from "@/lib/commands/use-command-form";
import type { TeamMember } from "@/lib/commands/invites";

/** Every staff role with what it opens; the taproom role waits on Program 12. */
const ROLES: [string, string][] = [
  ["admin", "everything, including team and settings"], ["sales", "orders, customers, price groups"],
  ["warehouse", "pick, receive, count, transfer"], ["brewer", "batches, cellar, packaging"],
];

export function MemberForm({ member, lastAdmin }: { member: TeamMember; lastAdmin: boolean }) {
  const [role, setRole] = useState(member.role);
  const form = useCommandForm("update_staff_role", { build: () => ({ userId: member.userId, role }), reset: () => setRole(member.role) });
  const remove = useCommandAction();
  const first = member.handle.slice(1);
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title={member.handle} trigger={<button type="button" className="w-full text-left">{E.nav(member.handle, `${member.email} · ${member.role}`)}</button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        {E.fld("Email", member.email)}
        <div className="flex flex-col gap-2">
          <Label htmlFor="member-role">Role</Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger id="member-role"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>{ROLES.map(([r, does]) => <SelectItem key={r} value={r}>{r} · {does}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        </div>
        {lastAdmin && E.note("This is the only admin; keep one admin before changing or removing them.")}
        <CommandFormMessage error={form.error ?? remove.error} />
        <CommandFormFooter>
          <Button type="submit" disabled={form.submitting || role === member.role || (lastAdmin && role !== "admin")}>{form.submitting ? "Saving…" : "Save role"}</Button>
        </CommandFormFooter>
      </form>
      {E.note(`Removing ${first} ends this brewery membership. Their sign-in account remains.`)}
      <Button type="button" variant="destructive" className="w-full" disabled={remove.busy || lastAdmin}
        onClick={() => void remove.run("revoke_staff", { userId: member.userId }, () => form.setOpen(false))}>Remove {first}</Button>
    </CommandForm>
  );
}
