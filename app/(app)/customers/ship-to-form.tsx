// app/(app)/customers/ship-to-form.tsx — dialog form for the upsert_ship_to command.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCommandForm } from "@/lib/commands/use-command-form";

export function ShipToForm({ customerId }: { customerId: string }) {
  const [label, setLabel] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const form = useCommandForm("upsert_ship_to", {
    build: () => ({
      customerId, label, address1, address2: address2 || undefined,
      city, state: state.toUpperCase(), zip,
    }),
    reset: () => {
      setLabel(""); setAddress1(""); setAddress2(""); setCity(""); setState(""); setZip("");
    },
  });

  return (
    <Dialog open={form.open} onOpenChange={form.setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          New Ship-To
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Ship-To</DialogTitle>
        </DialogHeader>
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
          {form.error && <p className="text-sm text-red-600">{form.error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={form.submitting}>
              {form.submitting ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
