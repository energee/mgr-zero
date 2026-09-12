"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormMessage } from "@/components/mgr/command-form";
import { ShipToView } from "@/components/mgr/views/ship-to";
import { toShipToViewProps } from "@/lib/mgr/ship-to-view";
import { useCommandForm } from "@/lib/commands/use-command-form";

export type ShipToEditData = {
  id: string; label: string; address1: string; address2: string | null;
  city: string; state: string; zip: string; is_default: boolean;
};

export function ShipToForm({ customerId, shipTo }: { customerId: string; shipTo?: ShipToEditData }) {
  const initial = {
    label: shipTo?.label ?? "", address1: shipTo?.address1 ?? "", address2: shipTo?.address2 ?? "",
    city: shipTo?.city ?? "", state: shipTo?.state ?? "", zip: shipTo?.zip ?? "", isDefault: shipTo?.is_default ?? false,
  };
  const [fields, setFields] = useState(initial);
  const set = <K extends keyof typeof initial>(key: K) => (value: typeof initial[K]) => setFields(prev => ({ ...prev, [key]: value }));
  const form = useCommandForm("upsert_ship_to", {
    build: () => ({ ...fields, id: shipTo?.id, customerId, address2: fields.address2 || undefined, state: fields.state.toUpperCase() }),
    reset: () => setFields(initial),
  });
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="Ship-to form"
      trigger={<Button variant="outline" size="sm">{shipTo ? "Edit" : "New Ship-To"}</Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-2">
        <ShipToView model={toShipToViewProps(fields)}
          controls={{ label: set("label"), address: set("address1"), address2: set("address2"), city: set("city"), state: set("state"), zip: set("zip"), isDefault: set("isDefault") }}
          messages={<CommandFormMessage error={form.error} />}
          submitting={form.submitting} />
      </form>
    </CommandForm>
  );
}
