// app/(app)/cellar/[occupancyId]/reading/reading-form.tsx — CommandForm for
// record_fermentation_reading: temperature always, gravity and pH optional
// (a quick temp check is a legitimate reading on its own). Gravity is typed in
// the reader's own unit (`unit`, resolved once by the page from
// get_gravity_unit) and converted to the stored degrees Plato on submit —
// record_fermentation_reading only ever receives Plato.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { gravityPlaceholder, gravityUnitShort, parseGravity, type GravityUnit } from "@/lib/mgr/gravity-unit";

export function ReadingForm({ occupancyId, unit }: { occupancyId: string; unit: GravityUnit }) {
  const [tempF, setTempF] = useState("");
  const [gravity, setGravity] = useState("");
  const [ph, setPh] = useState("");
  const [note, setNote] = useState("");
  const form = useCommandForm("record_fermentation_reading", {
    build: () => ({
      occupancyId, at: new Date().toISOString(), tempF: Number(tempF),
      gravityPlato: parseGravity(gravity, unit) ?? undefined, ph: ph ? Number(ph) : undefined, note: note || undefined,
    }),
    reset: () => { setTempF(""); setGravity(""); setPh(""); setNote(""); },
  });
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="Reading" trigger={<Button size="sm">Reading</Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="fr-temp">Temperature (°F)</Label>
          <Input id="fr-temp" type="number" step="any" value={tempF} onChange={(e) => setTempF(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="fr-gravity">Gravity ({gravityUnitShort(unit)}) · optional</Label>
          <Input id="fr-gravity" type="number" step="any" placeholder={gravityPlaceholder(unit)} value={gravity} onChange={(e) => setGravity(e.target.value)} />
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
