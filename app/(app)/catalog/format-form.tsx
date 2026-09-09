// app/(app)/catalog/format-form.tsx — CommandForm (bottom sheet on phone, dialog on desk) for the upsert_format command
// (create only from here). A packaged format carries package type, keg size (kegs), units per case and bbl per unit;
// brand pours are created and edited from their brand rows.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCommandForm } from "@/lib/commands/use-command-form";

const PACKAGE_TYPES = ["keg", "can", "bottle"] as const;
const KEG_SIZES = ["half_bbl", "quarter_bbl", "sixth_bbl", "fifty_l", "thirty_l", "twenty_l"] as const;

export function FormatForm() {
  const [name, setName] = useState("");
  const basis = "packaged";
  const [packageType, setPackageType] = useState<(typeof PACKAGE_TYPES)[number]>("keg");
  const [kegSize, setKegSize] = useState<(typeof KEG_SIZES)[number]>("half_bbl");
  const [unitsPerCase, setUnitsPerCase] = useState("");
  const [bblPerUnit, setBblPerUnit] = useState("");
  const form = useCommandForm("upsert_format", {
    build: () => ({
      name, basis, packageType, kegSize: packageType === "keg" ? kegSize : undefined,
      unitsPerCase: unitsPerCase ? Number(unitsPerCase) : undefined, bblPerUnit: bblPerUnit ? Number(bblPerUnit) : undefined,
    }),
    reset: () => { setName(""); setPackageType("keg"); setKegSize("half_bbl"); setUnitsPerCase(""); setBblPerUnit(""); },
  });

  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="New Format" trigger={<Button variant="outline">New Format</Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="format-name">Name</Label>
          <Input id="format-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="format-package-type">Package type</Label>
          <Select value={packageType} onValueChange={(v) => setPackageType(v as typeof packageType)}>
            <SelectTrigger id="format-package-type"><SelectValue /></SelectTrigger>
            <SelectContent>{PACKAGE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {packageType === "keg" ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="format-keg-size">Keg size</Label>
            <Select value={kegSize} onValueChange={(v) => setKegSize(v as typeof kegSize)}>
              <SelectTrigger id="format-keg-size"><SelectValue /></SelectTrigger>
              <SelectContent>{KEG_SIZES.map((k) => <SelectItem key={k} value={k}>{k.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
            </Select>
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
