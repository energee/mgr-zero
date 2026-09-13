"use client";
import { useId, useState, type FormEventHandler } from "react";
import { E } from "@/components/mgr/e";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";

const ROLES = [
  ["warehouse", "Warehouse", "pick, receive, count, transfer"], ["sales", "Sales", "orders, customers, price groups"],
  ["brewer", "Brewer", "batches, cellar, packaging"], ["taproom", "Taproom", "taproom stock and personal preferences"],
  ["admin", "Admin", "everything, including team and settings"],
];

function StaffRoleField({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) {
  const id = useId();
  const selected = ROLES.find(([role]) => role === value);
  return <div className="flex flex-col gap-2"><Label htmlFor={id}>Role</Label><Select value={value} onValueChange={onChange} disabled={disabled}>
    <SelectTrigger id={id}><SelectValue>{selected?.[1] ?? value}</SelectValue></SelectTrigger>
    <SelectContent><SelectGroup>{ROLES.map(([role, label]) => <SelectItem key={role} value={role}>{label}</SelectItem>)}</SelectGroup></SelectContent>
  </Select><p className="text-sm text-muted-foreground">{selected?.[2]}</p></div>;
}

export function InviteView({ buyer, email, defaultEmail = "", role, onEmailChange, onRoleChange, onSubmit, busy = false, error }: {
  buyer: boolean; email?: string; defaultEmail?: string; role?: string; onEmailChange?: (value: string) => void; onRoleChange?: (value: string) => void;
  onSubmit?: FormEventHandler<HTMLFormElement>; busy?: boolean; error?: string | null;
}) {
  const id = useId(), [draftEmail, setEmail] = useState(defaultEmail), [draftRole, setRole] = useState("warehouse");
  return <form onSubmit={event => { event.preventDefault(); if (!busy) onSubmit?.(event); }} className="flex flex-col gap-4">
    <Label htmlFor={id}>Email</Label><Input id={id} type="email" required value={email ?? draftEmail} disabled={busy} onChange={event => { setEmail(event.target.value); onEmailChange?.(event.target.value); }} />
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
