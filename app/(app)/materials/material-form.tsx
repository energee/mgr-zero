// app/(app)/materials/material-form.tsx — CommandForm for upsert_material: name,
// kind, base and purchase units with the factor between them, lot tracking,
// default vendor (what Planning drafts to when no contract covers the
// material). Creates or edits; units are refused by the command once the
// material has movements.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useCommandForm } from "@/lib/commands/use-command-form";

export type Material = {
  id: string; name: string; category: string; base_uom: string; purchase_uom: string; purchase_uom_factor: number;
  lot_tracked: boolean; default_vendor_id: string | null; reorder_point: number | null; active: boolean;
};
type Option = { id: string; name: string };

const KINDS = ["malt", "hop", "yeast", "adjunct", "chemical", "packaging", "other"];
const UOMS = ["lb", "kg", "oz", "g", "each", "l", "gal", "ml"];

export function MaterialForm({ material, vendors }: { material?: Material; vendors: Option[] }) {
  const [name, setName] = useState(material?.name ?? "");
  const [category, setCategory] = useState(material?.category ?? "");
  const [baseUom, setBaseUom] = useState(material?.base_uom ?? "lb");
  const [purchaseUom, setPurchaseUom] = useState(material?.purchase_uom ?? "lb");
  const [factor, setFactor] = useState(material ? String(material.purchase_uom_factor) : "1");
  const [lotTracked, setLotTracked] = useState(material?.lot_tracked ?? false);
  const [vendorId, setVendorId] = useState(material?.default_vendor_id ?? "");
  const [active, setActive] = useState(material?.active ?? true);
  const form = useCommandForm("upsert_material", {
    build: () => ({
      id: material?.id, name, category, baseUom, purchaseUom, purchaseUomFactor: Number(factor) || 1, lotTracked,
      defaultVendorId: vendorId || undefined, active,
    }),
    reset: () => {
      setName(material?.name ?? ""); setCategory(material?.category ?? ""); setBaseUom(material?.base_uom ?? "lb");
      setPurchaseUom(material?.purchase_uom ?? "lb"); setFactor(material ? String(material.purchase_uom_factor) : "1");
      setLotTracked(material?.lot_tracked ?? false); setVendorId(material?.default_vendor_id ?? ""); setActive(material?.active ?? true);
    },
  });
  const ready = name.trim() && category && Number(factor) > 0;
  const trigger = material ? <Button variant="ghost" size="sm">Edit</Button> : <Button size="sm">Add material</Button>;
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title={material ? material.name : "New material"} trigger={trigger}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="m-name">Material name</Label>
          <Input id="m-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="m-kind">Kind</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger id="m-kind"><SelectValue placeholder="Kind" /></SelectTrigger>
            <SelectContent>{KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="m-factor">Base units</Label>
            <Input id="m-factor" type="number" min="0" step="any" value={factor} onChange={(e) => setFactor(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="m-puom">Purchase unit</Label>
            <Select value={purchaseUom} onValueChange={setPurchaseUom}>
              <SelectTrigger id="m-puom"><SelectValue /></SelectTrigger>
              <SelectContent>{UOMS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="m-uom">Unit</Label>
            <Select value={baseUom} onValueChange={setBaseUom}>
              <SelectTrigger id="m-uom"><SelectValue /></SelectTrigger>
              <SelectContent>{UOMS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">A 44 lb box is purchase unit each with 44 base units, not a “box” unit: one unit vocabulary, packaging is the factor.</p>
        <div className="flex flex-col gap-2">
          <Label htmlFor="m-vendor">Default vendor · optional</Label>
          <Select value={vendorId || NONE} onValueChange={(v) => setVendorId(v === NONE ? "" : v)}>
            <SelectTrigger id="m-vendor"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>None</SelectItem>
              {vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="m-lot">Lot-tracked · receipts name a lot, consumption picks one</Label>
          <Switch id="m-lot" checked={lotTracked} onCheckedChange={setLotTracked} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="m-active">Active · available to recipes and purchase orders</Label>
          <Switch id="m-active" checked={active} onCheckedChange={setActive} />
        </div>
        <CommandFormMessage error={form.error} />
        <CommandFormFooter>
          <Button type="submit" disabled={form.submitting || !ready}>{form.submitting ? "Saving…" : "Save material"}</Button>
        </CommandFormFooter>
      </form>
    </CommandForm>
  );
}
