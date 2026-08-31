// app/(app)/customers/[id]/invite-portal-user-form.tsx — dialog form for the
// invite_customer_user command (spec decision 1: portal access is granted per
// customer, not per brewery).
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCommandForm } from "@/lib/commands/use-command-form";

export function InvitePortalUserForm({ customerId }: { customerId: string }) {
  const [email, setEmail] = useState("");
  const form = useCommandForm("invite_customer_user", {
    build: () => ({ email, customerId }),
    reset: () => setEmail(""),
  });

  return (
    <Dialog open={form.open} onOpenChange={form.setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Invite Portal User
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite Portal User</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-portal-email">Email</Label>
            <Input id="invite-portal-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          {form.error && <p className="text-sm text-red-600">{form.error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={form.submitting}>
              {form.submitting ? "Inviting…" : "Invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
