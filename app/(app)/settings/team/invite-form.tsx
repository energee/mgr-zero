"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { E } from "@/components/mgr/e";
import { CommandForm } from "@/components/mgr/command-form";
import { InviteView } from "@/components/mgr/views/team-controls";
import { useCommandAction } from "@/lib/commands/use-command-form";

/** Team and first-run share staff invitations; customer detail fixes buyer membership. */
export function InviteForm({ customerId }: { customerId?: string }) {
  const action = useCommandAction();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("warehouse");
  const [sent, setSent] = useState<string | null>(null);
  const title = customerId ? "Invite portal user" : "Invite staff";
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const name = customerId ? "invite_customer_user" : "invite_staff";
    const input = customerId ? { email, customerId } : { email, role };
    await action.run(name, input, data => {
      const pending = (data as { state?: string } | null)?.state === "pending_consent";
      setEmail(""); setRole("warehouse"); setOpen(false);
      setSent(pending
        ? "Invitation pending. They see it in Invitations the next time they sign in."
        : "Invite sent. The recipient can set their name and password from the email.");
    });
  }
  return <>
    <div role="status">{E.polite(sent)}</div>
    <CommandForm open={open} onOpenChange={next => { if (!action.busy) { setOpen(next); if (next) setSent(null); if (!next) action.setError(null); } }} title={title} trigger={<Button variant="outline">{title}</Button>}>
      <InviteView buyer={Boolean(customerId)} email={email} role={role} onEmailChange={setEmail} onRoleChange={setRole} onSubmit={submit} busy={action.busy} error={action.error} />
    </CommandForm>
  </>;
}
