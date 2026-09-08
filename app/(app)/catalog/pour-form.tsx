"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { useCommandForm } from "@/lib/commands/use-command-form";

export function PourForm({ brand, pour }: { brand: { id: string; name: string }; pour?: { id: string; name: string; ounces: number } }) {
  const id = useId();
  const [name, setName] = useState(pour?.name ?? "");
  const [ounces, setOunces] = useState(pour ? String(pour.ounces) : "");
  const form = useCommandForm("upsert_format", {
    build: () => ({ id: pour?.id, name, basis: "poured", brandId: brand.id, ounces: Number(ounces) }),
    reset: () => { setName(pour?.name ?? ""); setOunces(pour ? String(pour.ounces) : ""); },
  });
  return <CommandForm open={form.open} onOpenChange={form.setOpen} title={`${pour ? "Edit pour" : "New pour"} · ${brand.name}`} trigger={<Button variant="outline">{pour ? "Edit pour" : "New pour"}</Button>}>
    <form onSubmit={form.submit} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{brand.name} · A glass served at the taproom; never held as stock.</p>
      <div className="flex flex-col gap-2"><Label htmlFor={`${id}-name`}>Name</Label><Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Pint" required /></div>
      <div className="flex flex-col gap-2"><Label htmlFor={`${id}-ounces`}>Ounces</Label><Input id={`${id}-ounces`} type="number" min="0" step="any" value={ounces} onChange={(e) => setOunces(e.target.value)} required /></div>
      <CommandFormMessage error={form.error} />
      <CommandFormFooter><Button type="submit" disabled={form.submitting || !(Number(ounces) > 0)}>{form.submitting ? "Saving…" : pour ? "Save pour" : "Create pour"}</Button></CommandFormFooter>
    </form>
  </CommandForm>;
}
