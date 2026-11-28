// app/(app)/materials/material-form.tsx — CommandForm for upsert_material: name,
// kind, base and purchase units with the factor between them, lot tracking,
// default vendor (what Planning drafts to when no contract covers the
// material), for malt and adjunct the extract potential recipe predictions
// read (#430), for hops the alpha acid the recipe IBU reads, and the word one
// purchase unit is sold by (Sold by: a recipe reads whole packs in it), and the
// typed price of one purchase unit, which recipe cost reads until the material
// is received. A saved word or price can be changed but not cleared: sending
// none keeps it. Creates or
// edits. The command refuses a base unit change once anything stores a
// quantity of the material (#614). It refuses a purchase unit or factor change
// only once a purchase order or contract counts the material in purchase
// units, so a material already in recipes or in stock can still take its pack.
// Turning lot tracking on is refused while stock without a lot is on hand
// (#452). The command's message names what blocks a refused change.
// On Add material, leaving the name asks suggest_material_category once per name;
// a confident kind shows on the empty Kind pick and Tab accepts it. It is never
// saved unless accepted (docs/plans/jev-suggestions.md). Also on Add material only,
// setting Kind (accepted or picked) fills Base unit, Purchase unit and Lot-tracked
// from it (fieldsForKind), leaving any of them the user changed.
"use client";

import { useSimilarNames } from "@/components/mgr/similar-names";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { useCommandQuery } from "@/components/mgr/query-provider";
import { MaterialView, ALPHA_KINDS, EXTRACT_KINDS } from "@/components/mgr/views/material";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { MATERIAL_CATEGORIES, type PackName } from "@/lib/mgr/enums";
import { fieldsForKind } from "@/lib/mgr/material-view";
import { dollarsInput, optionalMoneyError, toCents } from "@/lib/mgr/money";
export type Material = {
  id: string; name: string; category: string; base_uom: string; purchase_uom: string; purchase_uom_factor: number;
  lot_tracked: boolean; default_vendor_id: string | null; reorder_point: number | null; active: boolean;
  extract_potential: number | null; alpha_acid: number | null; pack_name: PackName | null; purchase_unit_cost_cents: number | null;
};
type Option = { id: string; name: string };

const UOMS = ["lb", "kg", "oz", "g", "each", "l", "gal", "ml"];
/** Add material's starting Base unit, Purchase unit and Lot-tracked; the kind fills only what still holds them. */
const ADD_FIELDS = { unit: "lb", purchaseUnit: "lb", lotTracked: false };

export function MaterialForm({ material, vendors }: { material?: Material; vendors: Option[] }) {
  const [name, setName] = useState(material?.name ?? "");
  const [category, setCategory] = useState(material?.category ?? "");
  const [baseUom, setBaseUom] = useState(material?.base_uom ?? ADD_FIELDS.unit);
  const [purchaseUom, setPurchaseUom] = useState(material?.purchase_uom ?? ADD_FIELDS.purchaseUnit);
  const [factor, setFactor] = useState(material ? String(material.purchase_uom_factor) : "1");
  const [lotTracked, setLotTracked] = useState(material?.lot_tracked ?? ADD_FIELDS.lotTracked);
  const [vendorId, setVendorId] = useState(material?.default_vendor_id ?? "");
  const [active, setActive] = useState(material?.active ?? true);
  const [extract, setExtract] = useState(material?.extract_potential != null ? String(material.extract_potential) : "");
  const [alpha, setAlpha] = useState(material?.alpha_acid != null ? String(material.alpha_acid) : "");
  const [packName, setPackName] = useState<string>(material?.pack_name ?? "");
  const [price, setPrice] = useState(dollarsInput(material?.purchase_unit_cost_cents));
  // The name last left on Add material; the suggestion is asked for it.
  const [askedName, setAskedName] = useState("");
  const suggestion = useCommandQuery<{ category: string | null }>(
    "suggest_material_category", { name: askedName },
    !material && askedName !== "" && category === "",
  );
  const similar = useSimilarNames("material", material);
  const form = useCommandForm("upsert_material", {
    build: () => ({
      id: material?.id, name, category, baseUom, purchaseUom, purchaseUomFactor: Number(factor) || 1, lotTracked,
      defaultVendorId: vendorId || undefined, active,
      // Only where the field shows; blank or another kind sends none (an edit keeps the old one).
      extractPotential: EXTRACT_KINDS.has(category) && Number(extract) > 0 ? Number(extract) : undefined,
      alphaAcid: ALPHA_KINDS.has(category) && Number(alpha) > 0 ? Number(alpha) : undefined,
      // None picked sends none; on an edit that keeps the saved word.
      packName: packName || undefined,
      // Blank sends none; on an edit that keeps the saved price.
      purchaseUnitCostCents: toCents(price),
    }),
    reset: () => {
      setName(material?.name ?? ""); setCategory(material?.category ?? ""); setBaseUom(material?.base_uom ?? ADD_FIELDS.unit);
      setPurchaseUom(material?.purchase_uom ?? ADD_FIELDS.purchaseUnit); setFactor(material ? String(material.purchase_uom_factor) : "1");
      setLotTracked(material?.lot_tracked ?? ADD_FIELDS.lotTracked); setVendorId(material?.default_vendor_id ?? ""); setActive(material?.active ?? true);
      setExtract(material?.extract_potential != null ? String(material.extract_potential) : "");
      setAlpha(material?.alpha_acid != null ? String(material.alpha_acid) : "");
      setPackName(material?.pack_name ?? "");
      setPrice(dollarsInput(material?.purchase_unit_cost_cents));
      setAskedName("");
    },
  });
  const changeKind = (kind: string) => {
    const filled = fieldsForKind({ unit: baseUom, purchaseUnit: purchaseUom, lotTracked }, category, kind, ADD_FIELDS);
    setCategory(kind); setBaseUom(filled.unit); setPurchaseUom(filled.purchaseUnit); setLotTracked(filled.lotTracked);
  };
  const priceError = optionalMoneyError(price);
  const ready = name.trim() && category && Number(factor) > 0 && !priceError;
  const trigger = material ? <Button variant="ghost" size="sm">Edit</Button> : <Button size="sm">Add material</Button>;
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title={material ? "Edit material" : "Add material"} trigger={trigger}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <MaterialView
          model={{ name, kind: category, kindOptions: MATERIAL_CATEGORIES, kindSuggestion: category === "" ? suggestion.data?.category ?? undefined : undefined, baseUnits: factor, purchaseUnit: purchaseUom, purchaseUnitOptions: UOMS, soldBy: packName, soldBySaved: Boolean(material?.pack_name), unit: baseUom, unitOptions: UOMS, defaultVendorId: vendorId, defaultVendorOptions: vendors.map(({ id, name: label }) => ({ id, label })), extractPotential: extract, alphaAcid: alpha, price, priceError, lotTracked, active }}
          controls={{ name: setName, kind: material ? setCategory : changeKind, baseUnits: setFactor, purchaseUnit: setPurchaseUom, soldBy: setPackName, unit: setBaseUom, defaultVendorId: setVendorId, extractPotential: setExtract, alphaAcid: setAlpha, price: setPrice, lotTracked: setLotTracked, active: setActive, nameBlur: () => { similar.check(name); if (!material) setAskedName(name.trim()); } }}
          nameNote={similar.note}
          messages={<CommandFormMessage error={form.error} />}
          footer={<CommandFormFooter><Button type="submit" disabled={form.submitting || !ready}>{form.submitting ? "Saving…" : "Save material"}</Button></CommandFormFooter>}
        />
      </form>
    </CommandForm>
  );
}
