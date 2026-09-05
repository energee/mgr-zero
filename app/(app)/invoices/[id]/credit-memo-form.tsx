// app/(app)/invoices/[id]/credit-memo-form.tsx — CommandForm (bottom sheet on phone, dialog on desk) for the
// create_credit_memo command: qty per invoice line to credit (0 = skip), a
// return-to location, and a reason. The plpgsql fn writes negative invoice
// lines at the original prices plus return_in movements at the chosen
// location.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter } from "@/components/mgr/command-form";
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

  const form = useCommandForm("create_credit_memo", {
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
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="Create credit memo" trigger={<Button size="sm" variant="outline">
          Credit memo
        </Button>}>
        <form onSubmit={form.submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Lines to credit</Label>
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
            <Input id="cm-reason" value={reason} onChange={(e) => setReason(e.target.value)} required />
          </div>
          {form.error && <p className="text-sm text-destructive">{form.error}</p>}
          <CommandFormFooter>
            <Button type="submit" disabled={form.submitting}>
              {form.submitting ? "Saving…" : "Create"}
            </Button>
          </CommandFormFooter>
        </form>
      </CommandForm>
  );
}
