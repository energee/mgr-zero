"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormMessage } from "@/components/mgr/command-form";
import { ShipToView } from "@/components/mgr/views/ship-to";
import { shipToFormFields, toShipToViewProps, type ShipToRecord } from "@/lib/mgr/ship-to-view";
import { useCommandForm } from "@/lib/commands/use-command-form";

export type ShipToEditData = ShipToRecord & { id: string };

/** customerCountry seeds a new ship-to's country; an edit keeps its own. */
export function ShipToForm({ customerId, customerCountry, shipTo }: { customerId: string; customerCountry: string; shipTo?: ShipToEditData }) {
  const initial = shipToFormFields(shipTo, customerCountry);
  const [fields, setFields] = useState(initial);
  const set = <K extends keyof typeof initial>(key: K) => (value: typeof initial[K]) => setFields(prev => ({ ...prev, [key]: value }));
  const form = useCommandForm("upsert_ship_to", {
    validationFields: ["label", "country", "address1", "address2", "city", "state", "zip"],
    // Blanks are omitted (an address outside the US may have none); only a US address has a state.
    build: () => ({
      id: shipTo?.id, customerId, label: fields.label, country: fields.country, isDefault: fields.isDefault,
      address1: fields.address1 || undefined, address2: fields.address2 || undefined, city: fields.city || undefined, zip: fields.zip || undefined,
      state: fields.country === "US" ? fields.state.toUpperCase() : undefined,
    }),
    reset: () => setFields(initial),
    target: shipTo?.id,
  });
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="Ship-to form"
      trigger={<Button variant="outline" size="sm">{shipTo ? "Edit" : "New ship-to"}</Button>}>
      <form noValidate onSubmit={form.submit} className="flex flex-col gap-2">
        <ShipToView model={toShipToViewProps(fields)}
          errors={{ ...form.fieldErrors, address: form.fieldErrors.address1 }}
          controls={{ label: set("label"), country: set("country"), address: set("address1"), address2: set("address2"), city: set("city"), state: set("state"), zip: set("zip"), isDefault: set("isDefault") }}
          messages={<CommandFormMessage error={form.error} />}
          submitting={form.submitting} />
      </form>
    </CommandForm>
  );
}
