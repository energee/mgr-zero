// app/(app)/catalog/format-form.tsx — CommandForm (bottom sheet on phone, dialog on desk) for the upsert_format command
// (create only from here). A packaged format carries package type, keg size (kegs), units per case and bbl per unit;
// a poured format is just a name.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCommandForm } from "@/lib/commands/use-command-form";

const PACKAGE_TYPES = ["keg", "can", "bottle"] as const;
const KEG_SIZES = ["half_bbl", "quarter_bbl", "sixth_bbl", "fifty_l", "thirty_l", "twenty_l"] as const;
const selectClass = "h-9 rounded-md border bg-transparent px-2 text-sm";

export function FormatForm() {
  const [name, setName] = useState("");
  const [basis, setBasis] = useState<"packaged" | "poured">("packaged");
  const [packageType, setPackageType] = useState<(typeof PACKAGE_TYPES)[number]>("keg");
  const [kegSize, setKegSize] = useState<(typeof KEG_SIZES)[number]>("half_bbl");
  const [unitsPerCase, setUnitsPerCase] = useState("");
  const [bblPerUnit, setBblPerUnit] = useState("");
  const packaged = basis === "packaged";
  const form = useCommandForm("upsert_format", {
    build: () => packaged
      ? {
          name, basis, packageType, kegSize: packageType === "keg" ? kegSize : undefined,
          unitsPerCase: unitsPerCase ? Number(unitsPerCase) : undefined, bblPerUnit: bblPerUnit ? Number(bblPerUnit) : undefined,
        }
      : { name, basis },
    reset: () => { setName(""); setBasis("packaged"); setPackageType("keg"); setKegSize("half_bbl"); setUnitsPerCase(""); setBblPerUnit(""); },
  });

  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="New Format" trigger={<Button variant="outline">New Format</Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="format-name">Name</Label>
          <Input id="format-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="format-basis">Basis</Label>
          <select id="format-basis" className={selectClass} value={basis} onChange={(e) => setBasis(e.target.value as typeof basis)}>
            <option value="packaged">packaged (holds stock)</option>
            <option value="poured">poured (a glass, never stock)</option>
          </select>
        </div>
        {packaged ? (
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="format-package-type">Package type</Label>
              <select id="format-package-type" className={selectClass} value={packageType} onChange={(e) => setPackageType(e.target.value as typeof packageType)}>
                {PACKAGE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            {packageType === "keg" ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="format-keg-size">Keg size</Label>
                <select id="format-keg-size" className={selectClass} value={kegSize} onChange={(e) => setKegSize(e.target.value as typeof kegSize)}>
                  {KEG_SIZES.map((k) => <option key={k} value={k}>{k.replace(/_/g, " ")}</option>)}
                </select>
              </div>
            ) : null}
            <div className="flex flex-col gap-2">
              <Label htmlFor="format-units-per-case">Units per case</Label>
              <Input id="format-units-per-case" type="number" step="1" min="1" value={unitsPerCase} onChange={(e) => setUnitsPerCase(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="format-bbl-per-unit">BBL per unit</Label>
              <Input id="format-bbl-per-unit" inputMode="decimal" placeholder="0.5" value={bblPerUnit} onChange={(e) => setBblPerUnit(e.target.value)} />
            </div>
          </>
        ) : null}
        <CommandFormMessage error={form.error} />
        <CommandFormFooter>
          <Button type="submit" disabled={form.submitting}>
            {form.submitting ? "Creating…" : "Create"}
          </Button>
        </CommandFormFooter>
      </form>
    </CommandForm>
  );
}
