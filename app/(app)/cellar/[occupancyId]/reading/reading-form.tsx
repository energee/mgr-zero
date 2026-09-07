// app/(app)/cellar/[occupancyId]/reading/reading-form.tsx — CommandForm for
// record_fermentation_reading: temperature always, gravity and pH optional
// (a quick temp check is a legitimate reading on its own).
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCommandForm } from "@/lib/commands/use-command-form";

export function ReadingForm({ occupancyId }: { occupancyId: string }) {
  const [tempF, setTempF] = useState("");
  const [gravityPlato, setGravityPlato] = useState("");
  const [ph, setPh] = useState("");
  const [note, setNote] = useState("");
  const form = useCommandForm("record_fermentation_reading", {
    build: () => ({
      occupancyId, at: new Date().toISOString(), tempF: Number(tempF),
      gravityPlato: gravityPlato ? Number(gravityPlato) : undefined, ph: ph ? Number(ph) : undefined, note: note || undefined,
    }),
    reset: () => { setTempF(""); setGravityPlato(""); setPh(""); setNote(""); },
  });
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="Reading" trigger={<Button size="sm">Reading</Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="fr-temp">Temperature (°F)</Label>
          <Input id="fr-temp" type="number" step="any" value={tempF} onChange={(e) => setTempF(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="fr-gravity">Gravity (°Plato) · optional</Label>
          <Input id="fr-gravity" type="number" step="any" value={gravityPlato} onChange={(e) => setGravityPlato(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="fr-ph">pH · optional</Label>
          <Input id="fr-ph" type="number" step="any" value={ph} onChange={(e) => setPh(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="fr-note">Note · optional</Label>
          <Input id="fr-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <CommandFormMessage error={form.error} />
        <CommandFormFooter>
          <Button type="submit" disabled={form.submitting || !tempF}>{form.submitting ? "Saving…" : "Save reading"}</Button>
        </CommandFormFooter>
      </form>
    </CommandForm>
  );
}
