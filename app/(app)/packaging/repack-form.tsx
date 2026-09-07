// app/(app)/packaging/repack-form.tsx — CommandForm for record_repack:
// breaking a composed SKU (a case) into its component SKU at one bin. A
// shape change, never a production or a removal — the server refuses it
// unless the two SKUs share a brand and their formats are joined by exactly
// one format_components row.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCommandForm } from "@/lib/commands/use-command-form";

type Location = { id: string; name: string };
type Bin = { id: string; location_id: string; name: string };
type Sku = { id: string; label: string };

export function RepackForm({ locations, bins, skus }: { locations: Location[]; bins: Bin[]; skus: Sku[] }) {
  const [locationId, setLocationId] = useState("");
  const [binId, setBinId] = useState("");
  const [parentSkuId, setParentSkuId] = useState("");
  const [parentQty, setParentQty] = useState("");
  const [childSkuId, setChildSkuId] = useState("");
  const [childQty, setChildQty] = useState("");
  const form = useCommandForm("record_repack", {
    build: () => ({ locationId, binId, parentSkuId, parentQty: Number(parentQty), childSkuId, childQty: Number(childQty) }),
    reset: () => { setLocationId(""); setBinId(""); setParentSkuId(""); setParentQty(""); setChildSkuId(""); setChildQty(""); },
  });
  const ready = locationId && binId && parentSkuId && Number(parentQty) > 0 && childSkuId && Number(childQty) > 0;
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="Repack" trigger={<Button size="sm" variant="outline">Repack</Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="rp-loc">Location</Label>
          <Select value={locationId} onValueChange={(v) => { setLocationId(v); setBinId(""); }}>
            <SelectTrigger id="rp-loc"><SelectValue placeholder="Location" /></SelectTrigger>
            <SelectContent>{locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="rp-bin">Bin</Label>
          <Select value={binId} onValueChange={setBinId} disabled={!locationId}>
            <SelectTrigger id="rp-bin"><SelectValue placeholder="Bin" /></SelectTrigger>
            <SelectContent>{bins.filter((b) => b.location_id === locationId).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="rp-parent">Breaking</Label>
            <Select value={parentSkuId} onValueChange={setParentSkuId}>
              <SelectTrigger id="rp-parent"><SelectValue placeholder="SKU" /></SelectTrigger>
              <SelectContent>{skus.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
            <Input aria-label="Parent qty" type="number" min="0" step="any" placeholder="qty" value={parentQty} onChange={(e) => setParentQty(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="rp-child">Into</Label>
            <Select value={childSkuId} onValueChange={setChildSkuId}>
              <SelectTrigger id="rp-child"><SelectValue placeholder="SKU" /></SelectTrigger>
              <SelectContent>{skus.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
            <Input aria-label="Child qty" type="number" min="0" step="any" placeholder="qty" value={childQty} onChange={(e) => setChildQty(e.target.value)} />
          </div>
        </div>
        <CommandFormMessage error={form.error} />
        <CommandFormFooter>
          <Button data-variant="irreversible" type="submit" className="bg-irreversible text-irreversible-foreground hover:bg-irreversible/90" disabled={form.submitting || !ready}>
            {form.submitting ? "Saving…" : "Confirm repack"}
          </Button>
        </CommandFormFooter>
      </form>
    </CommandForm>
  );
}
