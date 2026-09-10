// app/(app)/materials/material-form.tsx — CommandForm for upsert_material: name,
// kind, base and purchase units with the factor between them, lot tracking,
// default vendor (what Planning drafts to when no contract covers the
// material). Creates or edits; units are refused by the command once the
// material has movements.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { MaterialView } from "@/components/mgr/views/material";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { toMaterialViewProps } from "@/lib/mgr/material-view";

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
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="Material" trigger={trigger}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <MaterialView
          model={toMaterialViewProps({ name, kind: category, kindOptions: KINDS, baseUnits: factor, purchaseUnit: purchaseUom, purchaseUnitOptions: UOMS, unit: baseUom, unitOptions: UOMS, defaultVendorId: vendorId, defaultVendorOptions: vendors.map(({ id, name: label }) => ({ id, label })), lotTracked, active })}
          controls={{ name: setName, kind: setCategory, baseUnits: setFactor, purchaseUnit: setPurchaseUom, unit: setBaseUom, defaultVendorId: setVendorId, lotTracked: setLotTracked, active: setActive }}
          messages={<CommandFormMessage error={form.error} />}
          footer={<CommandFormFooter><Button type="submit" disabled={form.submitting || !ready}>{form.submitting ? "Saving…" : "Save material"}</Button></CommandFormFooter>}
        />
      </form>
    </CommandForm>
  );
}
