"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormMessage } from "@/components/mgr/command-form";
import { InviteView } from "@/components/mgr/views/team-controls";
import { useCommandAction } from "@/lib/commands/use-command-form";

/** Team and first-run share staff invitations; customer detail fixes buyer membership. */
export function InviteForm({ customerId }: { customerId?: string }) {
  const action = useCommandAction();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("warehouse");
  const [sent, setSent] = useState(false);
  const title = customerId ? "Invite portal user" : "Invite staff";
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const name = customerId ? "invite_customer_user" : "invite_staff";
    const input = customerId ? { email, customerId } : { email, role };
    await action.run(name, input, () => {
      setEmail(""); setRole("warehouse"); setOpen(false); setSent(true);
    });
  }
  return <>
    {sent && <CommandFormMessage tone="warning">Invite sent. The recipient can set their name and password from the email.</CommandFormMessage>}
    <CommandForm open={open} onOpenChange={next => { if (!action.busy) { setOpen(next); if (next) setSent(false); if (!next) action.setError(null); } }} title={title} trigger={<Button variant="outline">{title}</Button>}>
      <InviteView buyer={Boolean(customerId)} email={email} role={role} onEmailChange={setEmail} onRoleChange={setRole} onSubmit={submit} busy={action.busy} error={action.error} />
    </CommandForm>
  </>;
}
