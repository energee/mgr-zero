// app/(app)/catalog/sku-form.tsx — dialog form for the create_sku command.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBrewery } from "../brewery-provider";
import { command } from "@/lib/commands/client";

const PACKAGE_TYPES = ["keg", "can", "bottle"] as const;

export function SkuForm({ productId }: { productId: string }) {
  const breweryId = useBrewery();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [packageType, setPackageType] = useState<(typeof PACKAGE_TYPES)[number]>("keg");
  const [unitsPerCase, setUnitsPerCase] = useState("");
  const [bblPerUnit, setBblPerUnit] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setName("");
    setPackageType("keg");
    setUnitsPerCase("");
    setBblPerUnit("");
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await command(breweryId, "create_sku", {
        productId,
        name,
        packageType,
        unitsPerCase: unitsPerCase ? Number(unitsPerCase) : undefined,
        bblPerUnit,
      });
      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to create SKU");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          New SKU
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New SKU</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
                {PACKAGE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sku-units-per-case">Units per case</Label>
            <Input
              id="sku-units-per-case"
              type="number"
              step="1"
              value={unitsPerCase}
              onChange={(e) => setUnitsPerCase(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sku-bbl-per-unit">BBL per unit</Label>
            <Input
              id="sku-bbl-per-unit"
              inputMode="decimal"
              placeholder="0.5"
              value={bblPerUnit}
              onChange={(e) => setBblPerUnit(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
