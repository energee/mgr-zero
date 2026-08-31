// app/(app)/settings/team/invite-form.tsx — dialog form for the invite_staff command.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCommandForm } from "@/lib/commands/use-command-form";

const ROLES = ["admin", "sales", "warehouse", "brewer"] as const;

export function InviteForm() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("sales");
  const form = useCommandForm("invite_staff", {
    build: () => ({ email, role }),
    reset: () => { setEmail(""); setRole("sales"); },
  });

  return (
    <Dialog open={form.open} onOpenChange={form.setOpen}>
      <DialogTrigger asChild>
        <Button>Invite Staff</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite Staff</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-role">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
