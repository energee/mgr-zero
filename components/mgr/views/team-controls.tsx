"use client";
import { useId, useState, type FormEventHandler } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { ConfirmDeleteControl } from "./confirm-delete";
import type { StaffRole } from "@/lib/commands/registry";
import { STAFF_ROLES } from "@/lib/mgr/enums";
import { sentenceCase } from "@/lib/mgr/labels";

const ROLE_DESCRIPTIONS: Record<StaffRole, string> = {
  admin: "Can use every staff screen and action, including Team and Settings.",
  sales: "Can manage the catalog, customers, pricing, orders, invoices and compliance reports.",
  warehouse: "Can pick and ship orders, and receive, count and transfer stock.",
  brewer: "Can manage recipes, batches, cellar work and packaging runs.",
  taproom: "Can run taproom taps and counts, and set personal preferences.",
};
const ROLE_OPTIONS = STAFF_ROLES.map(value => ({ value, label: sentenceCase(value) }));

function StaffRoleField({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) {
  return <div className="flex flex-col gap-2">{E.pick("Role", value, ROLE_OPTIONS, { onChange, disabled })}<p className="text-sm text-muted-foreground">{ROLE_DESCRIPTIONS[value as StaffRole]}</p></div>;
}

export function InviteView({ buyer, email, defaultEmail = "", role, onEmailChange, onRoleChange, onSubmit, busy = false, error }: {
  buyer: boolean; email?: string; defaultEmail?: string; role?: string; onEmailChange?: (value: string) => void; onRoleChange?: (value: string) => void;
  onSubmit?: FormEventHandler<HTMLFormElement>; busy?: boolean; error?: string | null;
}) {
  const id = useId(), [draftEmail, setEmail] = useState(defaultEmail), [draftRole, setRole] = useState("warehouse");
  return <form onSubmit={event => { event.preventDefault(); if (!busy) onSubmit?.(event); }} className="flex flex-col gap-4">
    {E.edit("Email", email ?? draftEmail, "email", undefined, { onChange: (nextValue: string) => { setEmail(nextValue); onEmailChange?.(nextValue); }, id, disabled: busy, required: true })}
    {buyer ? E.fld("Role", "Buyer") : <StaffRoleField value={role ?? draftRole} onChange={value => { setRole(value); onRoleChange?.(value); }} disabled={busy} />}
    {E.info("New accounts get an email to set up their login. Existing accounts get no email: when they next sign in, MGR opens Invitations (also at /invitations), and access starts only once they accept.")}
    <CommandFormMessage error={error} />
    <CommandFormFooter><Button type="submit" disabled={busy}>{busy ? "Sending…" : "Send invite"}</Button></CommandFormFooter>
  </form>;
}

export function TeamMemberView({ name, email, avatar, savedRoles, roles, onRolesChange, onSubmit, onRemove, saving = false, removing = false, error }: {
  name: string; email: string; avatar?: string; savedRoles: StaffRole[]; roles?: StaffRole[]; onRolesChange?: (value: StaffRole[]) => void;
  onSubmit?: FormEventHandler<HTMLFormElement>; onRemove?: () => Promise<boolean>; saving?: boolean; removing?: boolean; error?: string | null;
}) {
  const [draftRoles, setRoles] = useState(savedRoles), busy = saving || removing, value = roles ?? draftRoles;
  const unchanged = value.length === savedRoles.length && value.every(role => savedRoles.includes(role));
  const empty = value.length === 0;
  const removeName = name.replace(/^@/, "");
  return <>
    {E.row(name, email, "", "", E.face({ src: avatar, name: removeName }))}
    <form onSubmit={event => { event.preventDefault(); if (!busy && !empty && !unchanged) onSubmit?.(event); }} className="flex flex-col gap-4">
      {E.picks("Roles", STAFF_ROLES.filter(role => value.includes(role)), ROLE_OPTIONS, {
        onChange: next => { const selected = STAFF_ROLES.filter(role => next.includes(role)); setRoles(selected); onRolesChange?.(selected); },
        disabled: busy,
        "aria-invalid": empty,
      })}
      <p className="text-sm text-muted-foreground">Choose one or more roles. Each role adds its permissions. Admin includes every staff permission.</p>
      <CommandFormMessage error={error ?? (empty ? "Choose at least one role." : null)} />
      <CommandFormFooter><Button type="submit" disabled={busy || empty || unchanged}>{saving ? "Saving…" : "Save roles"}</Button></CommandFormFooter>
    </form>
    {E.note(`Removing ${removeName} ends this brewery membership.`)}
    <ConfirmDeleteControl title={`Remove ${removeName}`} busy={busy} error={error} onDelete={onRemove} busyLabel="Removing…"
      name={<>Remove <strong>{removeName}</strong> from this brewery?</>}
      warning="They lose access right away. Their sign-in account remains, and only a new invitation restores access." />
  </>;
}
