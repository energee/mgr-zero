// app/(app)/work/deliveries/[id]/delivered-form.tsx — receiving name plus
// the irreversible Delivered commit (confirm_delivery). The name is stored
// as text; nothing here implies a signature image.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCommandAction } from "@/lib/commands/use-command-form";

export function DeliveredForm({ deliveryId, suggestions }: { deliveryId: string; suggestions: string[] }) {
  const [signedBy, setSignedBy] = useState("");
  const { busy, error, run } = useCommandAction();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await run("confirm_delivery", { deliveryId, signedBy });
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="signed-by">Received by</Label>
        <Input id="signed-by" list="signed-by-names" value={signedBy} onChange={(e) => setSignedBy(e.target.value)} required />
        {suggestions.length > 0 && <datalist id="signed-by-names">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>}
      </div>
      <CommandFormMessage error={error} />
      <Button type="submit" data-variant="irreversible" className="w-full bg-irreversible text-irreversible-foreground hover:bg-irreversible/90 md:w-fit" disabled={busy || !signedBy.trim()}>
        {busy ? "Saving…" : "Delivered"}
      </Button>
    </form>
  );
}
