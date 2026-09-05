// app/(app)/catalog/sku-form.tsx — CommandForm (bottom sheet on phone, dialog on desk) for the create_sku command.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCommandForm } from "@/lib/commands/use-command-form";

const PACKAGE_TYPES = ["keg", "can", "bottle"] as const;

export function SkuForm({ productId }: { productId: string }) {
  const [name, setName] = useState("");
  const [packageType, setPackageType] = useState<(typeof PACKAGE_TYPES)[number]>("keg");
  const [unitsPerCase, setUnitsPerCase] = useState("");
  const [bblPerUnit, setBblPerUnit] = useState("");
  const form = useCommandForm("create_sku", {
    build: () => ({ productId, name, packageType, unitsPerCase: unitsPerCase ? Number(unitsPerCase) : undefined, bblPerUnit }),
    reset: () => { setName(""); setPackageType("keg"); setUnitsPerCase(""); setBblPerUnit(""); },
  });

  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="New SKU" trigger={<Button variant="outline" size="sm">
          New SKU
        </Button>}>
        <form onSubmit={form.submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="sku-name">Name</Label>
            <Input id="sku-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sku-package-type">Package type</Label>
            <Select value={packageType} onValueChange={(v) => setPackageType(v as typeof packageType)}>
              <SelectTrigger id="sku-package-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {PACKAGE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sku-units-per-case">Units per case</Label>
            <Input id="sku-units-per-case" type="number" step="1" value={unitsPerCase} onChange={(e) => setUnitsPerCase(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sku-bbl-per-unit">BBL per unit</Label>
            <Input id="sku-bbl-per-unit" inputMode="decimal" placeholder="0.5" value={bblPerUnit} onChange={(e) => setBblPerUnit(e.target.value)} required />
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
