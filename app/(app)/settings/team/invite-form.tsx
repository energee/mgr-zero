"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";
import { useBrewery } from "@/app/(app)/brewery-provider";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { invitationRequest, type InvitationRequest } from "@/lib/invite-form";

/** Team and first-run share staff invitations; customer detail fixes buyer membership. */
export function InviteForm({ customerId }: { customerId?: string }) {
  const id = useId();
  const breweryId = useBrewery();
  const action = useCommandAction();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("warehouse");
  const [sent, setSent] = useState(false);
  // ponytail: retry identity lasts while this page is open; persist an outbox for reload recovery.
  const request = useRef<InvitationRequest | null>(null);
  const title = customerId ? "Invite portal user" : "Invite staff";
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const name = customerId ? "invite_customer_user" : "invite_staff";
    const input = customerId ? { email, customerId } : { email, role };
    request.current = invitationRequest(request.current, breweryId, name, input);
    await action.run(name, input, () => {
      request.current = null;
      setEmail(""); setRole("warehouse"); setOpen(false); setSent(true);
    }, request.current.requestId);
  }
  return <>
    {sent && <CommandFormMessage tone="warning">Invite sent. The recipient can set their name and password from the email.</CommandFormMessage>}
    <CommandForm open={open} onOpenChange={next => { if (!action.busy) { setOpen(next); if (next) setSent(false); } }} title={title} trigger={<Button variant="outline">{title}</Button>}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Label htmlFor={`${id}-email`}>Email</Label>
        <Input id={`${id}-email`} type="email" required value={email} disabled={action.busy} onChange={event => setEmail(event.target.value)} />
        {customerId ? E.fld("Role", "Buyer") : <>
          <Label htmlFor={`${id}-role`}>Role</Label>
          <select id={`${id}-role`} className="min-h-11 rounded-md border bg-background px-3" value={role} disabled={action.busy} onChange={event => setRole(event.target.value)}>
            <option value="taproom">Taproom</option><option value="warehouse">Warehouse</option><option value="sales">Sales</option><option value="brewer">Brewer</option><option value="admin">Admin</option>
          </select>
        </>}
        {E.note("Sending an invite emails the recipient. Existing accounts cannot be attached with this form. Keep this page open to retry unchanged details after an error.")}
        <CommandFormMessage error={action.error} />
        <CommandFormFooter><Button type="submit" disabled={action.busy}>{action.busy ? "Sending…" : "Send invite"}</Button></CommandFormFooter>
      </form>
    </CommandForm>
  </>;
}
