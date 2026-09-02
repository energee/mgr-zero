// app/(app)/customers/ship-to-form.tsx — CommandForm (bottom sheet on phone, dialog on desk) for the upsert_ship_to
// command. Doubles as create (no `shipTo` prop) and edit (`shipTo` prop
// pre-fills fields and the command input carries `id`, per plan decision 8).
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCommandForm } from "@/lib/commands/use-command-form";

export type ShipToEditData = {
  id: string;
  label: string;
  address1: string;
  address2: string | null;
  city: string;
  state: string;
  zip: string;
};

export function ShipToForm({ customerId, shipTo }: { customerId: string; shipTo?: ShipToEditData }) {
  const isEdit = !!shipTo;
  const [label, setLabel] = useState(shipTo?.label ?? "");
  const [address1, setAddress1] = useState(shipTo?.address1 ?? "");
  const [address2, setAddress2] = useState(shipTo?.address2 ?? "");
  const [city, setCity] = useState(shipTo?.city ?? "");
  const [state, setState] = useState(shipTo?.state ?? "");
  const [zip, setZip] = useState(shipTo?.zip ?? "");
  const form = useCommandForm("upsert_ship_to", {
    build: () => ({
      ...(isEdit ? { id: shipTo.id } : {}),
      customerId, label, address1, address2: address2 || undefined,
      city, state: state.toUpperCase(), zip,
    }),
    reset: () => {
      setLabel(shipTo?.label ?? "");
      setAddress1(shipTo?.address1 ?? "");
      setAddress2(shipTo?.address2 ?? "");
      setCity(shipTo?.city ?? "");
      setState(shipTo?.state ?? "");
      setZip(shipTo?.zip ?? "");
    },
  });

  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title={isEdit ? "Edit Ship-To" : "New Ship-To"} trigger={<Button variant="outline" size="sm">
          {isEdit ? "Edit" : "New Ship-To"}
        </Button>}>
        <form onSubmit={form.submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="ship-to-label">Label</Label>
            <Input id="ship-to-label" value={label} onChange={(e) => setLabel(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ship-to-address1">Address 1</Label>
            <Input id="ship-to-address1" value={address1} onChange={(e) => setAddress1(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ship-to-address2">Address 2</Label>
            <Input id="ship-to-address2" value={address2} onChange={(e) => setAddress2(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ship-to-city">City</Label>
            <Input id="ship-to-city" value={city} onChange={(e) => setCity(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ship-to-state">State</Label>
            <Input
              id="ship-to-state"
              value={state}
              onChange={(e) => setState(e.target.value.toUpperCase())}
              maxLength={2}
              placeholder="NY"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ship-to-zip">Zip</Label>
            <Input id="ship-to-zip" value={zip} onChange={(e) => setZip(e.target.value)} required />
          </div>
          {form.error && <p className="text-sm text-destructive">{form.error}</p>}
          <CommandFormFooter>
            <Button type="submit" disabled={form.submitting}>
              {form.submitting ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save" : "Create"}
            </Button>
          </CommandFormFooter>
        </form>
      </CommandForm>
  );
}
