"use client";
import { useId, useState, type FormEventHandler } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";

const ROLES = [
  ["warehouse", "Warehouse", "pick, receive, count, transfer"], ["sales", "Sales", "orders, customers, price groups"],
  ["brewer", "Brewer", "batches, cellar, packaging"], ["taproom", "Taproom", "taproom stock and personal preferences"],
  ["admin", "Admin", "everything, including team and settings"],
];

function StaffRoleField({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) {
  const selected = ROLES.find(([role]) => role === value);
  return <div className="flex flex-col gap-2">{E.pick("Role", value, (ROLES.map(([role, label]) => ({ value: role, label }))), { onChange, disabled })}<p className="text-sm text-muted-foreground">{selected?.[2]}</p></div>;
}

export function InviteView({ buyer, email, defaultEmail = "", role, onEmailChange, onRoleChange, onSubmit, busy = false, error }: {
  buyer: boolean; email?: string; defaultEmail?: string; role?: string; onEmailChange?: (value: string) => void; onRoleChange?: (value: string) => void;
  onSubmit?: FormEventHandler<HTMLFormElement>; busy?: boolean; error?: string | null;
}) {
  const id = useId(), [draftEmail, setEmail] = useState(defaultEmail), [draftRole, setRole] = useState("warehouse");
  return <form onSubmit={event => { event.preventDefault(); if (!busy) onSubmit?.(event); }} className="flex flex-col gap-4">
    {E.edit("Email", email ?? draftEmail, "email", undefined, { onChange: (nextValue: string) => { setEmail(nextValue); onEmailChange?.(nextValue); }, id, disabled: busy, required: true })}
    {buyer ? E.fld("Role", "Buyer") : <StaffRoleField value={role ?? draftRole} onChange={value => { setRole(value); onRoleChange?.(value); }} disabled={busy} />}
    {E.note("Sending an invite emails the recipient and cannot be recalled. Existing accounts cannot be attached with this form. Keep this page open to retry unchanged details after an error.")}
    <CommandFormMessage error={error} />
    <CommandFormFooter><Button type="submit" disabled={busy}>{busy ? "Sending…" : "Send invite"}</Button></CommandFormFooter>
  </form>;
}

export function TeamMemberView({ name, email, avatar, savedRole, role, onRoleChange, onSubmit, onRemove, saving = false, removing = false, error }: {
  name: string; email: string; avatar?: string; savedRole: string; role?: string; onRoleChange?: (value: string) => void;
  onSubmit?: FormEventHandler<HTMLFormElement>; onRemove?: () => void; saving?: boolean; removing?: boolean; error?: string | null;
}) {
  const [draftRole, setRole] = useState(savedRole), busy = saving || removing, value = role ?? draftRole;
  const removeName = name.replace(/^@/, "");
  return <>
    {E.row(name, email, "", "", E.face({ src: avatar, name: name.replace(/^@/, "") }))}
    <form onSubmit={event => { event.preventDefault(); if (!busy && value !== savedRole) onSubmit?.(event); }} className="flex flex-col gap-4">
      <StaffRoleField value={value} onChange={next => { setRole(next); onRoleChange?.(next); }} disabled={busy} />
      <CommandFormMessage error={error} />
      <CommandFormFooter><Button type="submit" disabled={busy || value === savedRole}>{saving ? "Saving…" : "Save role"}</Button></CommandFormFooter>
    </form>
    {E.note(`Removing ${removeName} ends this brewery membership. Their sign-in account remains.`)}
    <Button type="button" variant="destructive" className="w-full" disabled={busy} onClick={onRemove}>{removing ? "Removing…" : `Remove ${removeName}`}</Button>
  </>;
}
