"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { NONE, Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { toast } from "sonner";

export function PortalFulfillmentForm({ locations, currentId }: { locations: { id: string; name: string }[]; currentId: string | null }) {
  const [locationId, setLocationId] = useState(currentId ?? "");
  const form = useCommandForm("set_portal_fulfillment_source", {
    build: () => ({ locationId }),
    reset: () => setLocationId(currentId ?? ""),
    onSuccess: () => toast.success("Fulfillment warehouse updated"),
  });
  return <section className="flex flex-col gap-2">
    <h2 className="font-semibold">Portal fulfillment warehouse</h2>
    <p>{locations.find((l) => l.id === currentId)?.name ?? "Not configured"}</p>
    {locations.length ? <CommandForm open={form.open} onOpenChange={form.setOpen} title="Portal fulfillment warehouse" trigger={<Button variant="outline">Change warehouse</Button>}>
      <form className="flex flex-col gap-4" onSubmit={form.submit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="portal-warehouse">Warehouse</FieldLabel>
            <Select required value={locationId || NONE} onValueChange={(value) => setLocationId(value === NONE ? "" : value)}>
              <SelectTrigger id="portal-warehouse" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>
                <SelectItem value={NONE} disabled>Choose warehouse</SelectItem>
                {locations.map((location) => <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>)}
              </SelectGroup></SelectContent>
            </Select>
          </Field>
        </FieldGroup>
        <CommandFormMessage error={form.error} />
        <CommandFormFooter><Button type="submit" disabled={form.submitting || !locationId}>{form.submitting ? "Saving…" : "Save warehouse"}</Button></CommandFormFooter>
      </form>
    </CommandForm> : <p>Add a warehouse in <Link className="underline" href="/locations">Locations</Link> before enabling portal orders.</p>}
  </section>;
}
