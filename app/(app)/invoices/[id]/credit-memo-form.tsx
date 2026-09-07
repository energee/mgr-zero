// app/(app)/invoices/[id]/credit-memo-form.tsx — CommandForm (bottom sheet on phone, dialog on desk) for the
// return_shipment command (screen record Return and credit): qty per invoice
// line to return (0 = skip), a return-to location, and the reason, which
// decides the beer and never the money: unsold and wrong item come back
// sellable, damaged comes back and is written to loss in the same call.
// The credit is always at the price frozen on the invoice line.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCommandForm } from "@/lib/commands/use-command-form";

type Line = { id: string; label: string; qty: number };

export function CreditMemoForm({
  invoiceId,
  lines,
  locations,
}: {
  invoiceId: string;
  lines: Line[];
  locations: { id: string; name: string }[];
}) {
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [locationId, setLocationId] = useState("");
  const [reason, setReason] = useState("");

  function reset() {
    setQtys({});
    setLocationId("");
    setReason("");
  }

  const form = useCommandForm("return_shipment", {
    build: () => ({
      invoiceId,
      locationId,
      reason,
      lines: lines
        .filter((l) => Number(qtys[l.id] ?? 0) > 0)
        .map((l) => ({ invoiceLineId: l.id, qty: Number(qtys[l.id]) })),
    }),
    reset,
  });

  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="Return shipment" trigger={<Button size="sm" variant="outline">
          Return
        </Button>}>
        <form onSubmit={form.submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Lines returning</Label>
            {lines.map((l) => (
              <div key={l.id} className="flex items-center gap-2">
                <Label className="flex-1 font-normal">
                  {l.label} (invoiced {l.qty})
                </Label>
                <Input
                  type="number"
                  min="0"
                  max={l.qty}
                  step="any"
                  className="w-24"
                  placeholder="0"
                  value={qtys[l.id] ?? ""}
                  onChange={(e) => setQtys((prev) => ({ ...prev, [l.id]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cm-location">Return to location</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger id="cm-location">
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cm-reason">Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger id="cm-reason">
                <SelectValue placeholder="Why is it coming back?" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="unsold">Unsold · back to stock</SelectItem>
                  <SelectItem value="wrong_item">Wrong item · back to stock</SelectItem>
                  <SelectItem value="damaged">Damaged · written to loss</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground">Credited at the price on this invoice, not today’s price list.</p>
          <CommandFormMessage error={form.error} />
          <CommandFormFooter>
            <Button type="submit" disabled={form.submitting || !reason || !locationId}>
              {form.submitting ? "Saving…" : "Return shipment"}
            </Button>
          </CommandFormFooter>
        </form>
      </CommandForm>
  );
}
