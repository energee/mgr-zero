// app/(app)/catalog/format-form.tsx — CommandForm (bottom sheet on phone, dialog on desk) for the upsert_format command
// (create only from here). A packaged format carries package type, keg size (kegs), units per case and bbl per unit;
// brand pours are created and edited from their brand rows.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { FormatView } from "@/components/mgr/views/format";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { toFormatViewProps } from "@/lib/mgr/format-view";
import { parseVolumeToBbl } from "@/lib/volume";

type PackageType = "keg" | "can" | "bottle";
type KegSize = "half_bbl" | "quarter_bbl" | "sixth_bbl" | "fifty_l" | "thirty_l" | "twenty_l";
const VOLUME_UNITS = ["oz", "gal", "bbl"] as const;

export function FormatForm() {
  const [name, setName] = useState("");
  const basis = "packaged";
  const [packageType, setPackageType] = useState<PackageType>("keg");
  const [kegSize, setKegSize] = useState<KegSize>("half_bbl");
  const [unitsPerCase, setUnitsPerCase] = useState("");
  const [volumeValue, setVolumeValue] = useState("");
  const [volumeUnit, setVolumeUnit] = useState<(typeof VOLUME_UNITS)[number]>("bbl");
  const form = useCommandForm("upsert_format", {
    build: () => ({
      name, basis, packageType, kegSize: packageType === "keg" ? kegSize : undefined,
      unitsPerCase: unitsPerCase ? Number(unitsPerCase) : undefined,
      bblPerUnit: parseVolumeToBbl(volumeValue, volumeUnit),
    }),
    reset: () => { setName(""); setPackageType("keg"); setKegSize("half_bbl"); setUnitsPerCase(""); setVolumeValue(""); setVolumeUnit("bbl"); },
  });
  const model = {
    ...toFormatViewProps({ format: { id: "new", name, basis, package_type: packageType, bbl_per_unit: null } }),
    name,
    packageType,
    kegSize,
    unitsPerCase,
    volumeValue,
    volumeUnitIndex: VOLUME_UNITS.indexOf(volumeUnit),
    bom: [],
  };
  const controls = {
    name: setName,
    packageType: (value: string) => setPackageType(value as typeof packageType),
    kegSize: (value: string) => setKegSize(value as typeof kegSize),
    unitsPerCase: setUnitsPerCase,
    volumeValue: setVolumeValue,
    volumeUnit: (value: string) => setVolumeUnit(value as typeof volumeUnit),
  };

  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="New Format" trigger={<Button variant="outline">New Format</Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <FormatView
          model={model}
          controls={controls}
          messages={<CommandFormMessage error={form.error} />}
          footer={
            <CommandFormFooter>
              <Button type="submit" disabled={form.submitting || !name}>
                {form.submitting ? "Creating…" : "Create"}
              </Button>
            </CommandFormFooter>
          }
        />
      </form>
    </CommandForm>
  );
}
