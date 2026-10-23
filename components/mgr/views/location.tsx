// components/mgr/views/location.tsx — Location detail drawing, and the
// location fields it shares with the live Add/Edit location dialog
// (LocationForm) and the first-run Add location step. Inventory paints the
// fields + Save. Live is read-only flds with LocationForm in the header.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { FieldDescription } from "@/components/ui/field";
import { LOCATION_USES, type LocationUse } from "@/lib/mgr/enums";
import { LOCATION_USE_OPTIONS } from "@/lib/mgr/labels";
import type { LocationViewModel } from "@/lib/mgr/location-view";

export type { LocationViewModel };

const USES_HINT_ID = "location-uses-hint";

/** Location name and Uses, plus what a bin is. Uses is a multi-select: every
 *  taproom or warehouse guard asks whether that use is among them. Fixtures
 *  pass no controls and draw the values unwired. */
export function LocationFields({ name, uses, controls = {} }: {
  name: string;
  uses: LocationUse[];
  controls?: { name?: (value: string) => void; uses?: (value: LocationUse[]) => void };
}) {
  const setUses = controls.uses;
  return (
    <>
      {E.edit("Location name", name, "text", undefined, { onChange: controls.name, required: Boolean(controls.name) })}
      {E.picks("Uses", uses, LOCATION_USE_OPTIONS, {
        // Kept in enum order, whatever order the toggles were pressed in.
        onChange: setUses ? (next) => setUses(LOCATION_USES.filter((use) => next.includes(use))) : undefined,
        "aria-describedby": USES_HINT_ID,
        description: <FieldDescription id={USES_HINT_ID}>Choose every use that applies; one place can be all three. Taproom tools list every location that includes Taproom. Warehouse pickers list every location that includes Warehouse.</FieldDescription>,
      })}
      {E.info("Bins are the rooms and racks inside this location where stock sits. A new location starts with Cold, Dry and Walk-in. Add or rename bins under Location bins.")}
    </>
  );
}

export function LocationView({
  model,
  headerAction,
  footer,
  readOnly,
}: {
  model: LocationViewModel;
  headerAction?: ReactNode;
  footer?: ReactNode;
  /** Live detail is read-only; edits live in LocationForm. */
  readOnly?: boolean;
}) {
  return (
    <>
      {E.back("Locations", model.name, headerAction, model.backHref)}
      {readOnly ? (
        <>
          {E.fld("Uses", model.usesLabel)}
          {E.fld("Timezone", model.timezone)}
          {E.nav("Location bins", model.bins, "", undefined, model.binsHref)}
        </>
      ) : (
        <>
          <LocationFields name={model.name} uses={model.uses} />
          {E.fld("Timezone", model.timezone)}
          {E.nav("Location bins", model.bins)}
        </>
      )}
      {footer !== undefined ? footer : (readOnly ? null : E.btn("Save location"))}
    </>
  );
}
