"use client";
import { useId, useState, type FormEventHandler } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { ConfirmDeleteControl } from "./confirm-delete";
import type { StaffRole } from "@/lib/commands/registry";
import { STAFF_ROLES } from "@/lib/mgr/enums";
import { sentenceCase } from "@/lib/mgr/labels";
import { emailError } from "@/lib/mgr/email";
import { submitReason } from "@/lib/mgr/submit-reason";
import { useTouchedLines } from "@/lib/mgr/touched-lines";

const ROLE_DESCRIPTIONS: Record<StaffRole, string> = {
  admin: "Can use every staff screen and action, including Team and Settings.",
  sales: "Can manage the catalog, customers, pricing, orders, invoices and compliance reports.",
  warehouse: "Can pick, ship and deliver orders, run packaging, place purchase orders, and receive, count and transfer stock and kegs.",
  brewer: "Can manage recipes, batches, cellar work and packaging runs.",
  taproom: "Can change taproom taps, record taproom counts, view variance and set personal preferences.",
};
const ROLE_OPTIONS = STAFF_ROLES.map(value => ({ value, label: sentenceCase(value) }));

function StaffRoleField({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) {
  return <div className="flex flex-col gap-2">{E.pick("Role", value, ROLE_OPTIONS, { onChange, disabled })}<p className="text-sm text-muted-foreground">{ROLE_DESCRIPTIONS[value as StaffRole]}</p></div>;
}

/** The invite form shared by Team, first-run and customer detail (InviteForm) and the inventory frames.
 *  Email and role are controlled when their props are passed (InviteForm) and kept in local state
 *  otherwise (the frames). The local role starts at Warehouse, the same default InviteForm resets to. */
export function InviteView({ buyer, email, defaultEmail = "", role, onEmailChange, onRoleChange, onSubmit, busy = false, error, emailError: serverEmailError, validationAttempted = false }: {
  buyer: boolean; email?: string; defaultEmail?: string; role?: string; onEmailChange?: (value: string) => void; onRoleChange?: (value: string) => void;
  onSubmit?: FormEventHandler<HTMLFormElement>; busy?: boolean; error?: string | null; validationAttempted?: boolean;
  emailError?: string;
}) {
  const id = useId(), [draftEmail, setEmail] = useState(defaultEmail), [draftRole, setRole] = useState("warehouse");
  const touched = useTouchedLines(validationAttempted);
  const fieldError = emailError(email ?? draftEmail);
  return <form noValidate onSubmit={event => { event.preventDefault(); touched.touch(0); if (!busy && !fieldError) onSubmit?.(event); }} className="flex flex-col gap-4">
    {E.edit("Email", email ?? draftEmail, "email", undefined, { onChange: (nextValue: string) => { setEmail(nextValue); onEmailChange?.(nextValue); }, id, onBlur: () => touched.touch(0), error: serverEmailError ?? (touched.shown(0) ? fieldError : undefined), disabled: busy, required: true })}
    {buyer ? E.fld("Role", "Buyer") : <StaffRoleField value={role ?? draftRole} onChange={value => { setRole(value); onRoleChange?.(value); }} disabled={busy} />}
    {E.info("New accounts get an email to set up their login. Existing accounts get no email. They see the invitation in Invitations the next time they sign in, or at /invitations. Access starts once they accept, within seven days.")}
    <CommandFormMessage error={error} />
    <CommandFormFooter>{E.submit("Send invite", { submitting: busy, busy: "Sending…", reason: submitReason(fieldError ? ["a valid email address"] : []) })}</CommandFormFooter>
  </form>;
}

/** Resend and Cancel for one pending invitation on Team. The live adapter (InvitationActions)
 *  passes the commands and their shared busy/error; the inventory frame leaves them inert.
 *  Cancel confirms first in the shared sheet. */
export function PendingInvitationActionsView({ email, onResend, onCancel, busy = false, error }: {
  email: string; onResend?: () => void; onCancel?: () => Promise<boolean>; busy?: boolean; error?: string | null;
}) {
  return <div className="flex flex-col items-end gap-2">
    <div className="flex gap-2">
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onResend}>Resend</Button>
      <ConfirmDeleteControl title="Cancel invitation" triggerLabel="Cancel" size="sm" busy={busy} error={error} onDelete={onCancel}
        busyLabel="Cancelling…" dismissLabel="Keep invitation"
        name={<>Cancel the invitation for <strong>{email}</strong>?</>}
        warning="They can no longer accept it. Send a new invitation to give them access later." />
    </div>
    <CommandFormMessage error={error} />
  </div>;
}

/** `name` is list_team_members' identity label, which already carries the email. */
export function TeamMemberView({ name, avatar, savedRoles, roles, onRolesChange, onSubmit, onRemove, saving = false, removing = false, error }: {
  name: string; avatar?: string; savedRoles: StaffRole[]; roles?: StaffRole[]; onRolesChange?: (value: StaffRole[]) => void;
  onSubmit?: FormEventHandler<HTMLFormElement>; onRemove?: () => Promise<boolean>; saving?: boolean; removing?: boolean; error?: string | null;
}) {
  const [draftRoles, setRoles] = useState(savedRoles), busy = saving || removing, value = roles ?? draftRoles;
  const unchanged = value.length === savedRoles.length && value.every(role => savedRoles.includes(role));
  const empty = value.length === 0;
  return <>
    {E.row(name, "", "", "", E.face({ src: avatar, name }))}
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
    {E.note(`Removing ${name} ends this brewery membership.`)}
    <ConfirmDeleteControl title={`Remove ${name}`} busy={busy} error={error} onDelete={onRemove} busyLabel="Removing…"
      name={<>Remove <strong>{name}</strong> from this brewery?</>}
      warning="They lose access right away. Their sign-in account remains, and only a new invitation restores access." />
  </>;
}
