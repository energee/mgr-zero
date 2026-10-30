// components/mgr/views/location.tsx — Location detail drawing, and the
// location fields it shares with the live Add/Edit location dialog
// (LocationForm) and the first-run Add location step. Inventory paints the
// fields + Save. Live is read-only flds with LocationForm in the header. Both
// draw the location's bins (LocationBinsView) below, through `bins` (#1507).
import { useId, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { FieldDescription } from "@/components/ui/field";
import type { LocationUse } from "@/lib/mgr/enums";
import { LOCATION_USE_OPTIONS } from "@/lib/mgr/labels";
import type { LocationViewModel } from "@/lib/mgr/location-view";

// create_location seeds these three bins; the location's Bins section (admin, warehouse) edits them.
const BINS_NOTE = "Bins are the rooms and racks inside a location where stock sits. Every new location starts with Cold, Dry and Walk-in. Admin and Warehouse add, rename or remove bins on the location page.";

/** Location name and Uses, plus what a bin is. Uses takes several answers:
 *  every taproom or warehouse guard asks whether that use is among them.
 *  Fixtures pass no controls and draw the values unwired. */
export function LocationFields({ name, uses, controls = {} }: {
  name: string;
  uses: LocationUse[];
  controls?: { name?: (value: string) => void; uses?: (value: LocationUse[]) => void };
}) {
  const nameId = useId();
  const hintId = useId();
  const setUses = controls.uses;
  return (
    <>
      {/* Required only when wired to a form; fixtures pass no controls. */}
      {E.edit("Location name", name, "text", undefined, { id: nameId, onChange: controls.name, required: Boolean(controls.name) })}
      {E.picks("Uses", uses, LOCATION_USE_OPTIONS, {
        // The options are LOCATION_USES, so every picked value is a LocationUse.
        onChange: setUses ? (next) => setUses(next as LocationUse[]) : undefined,
        "aria-describedby": hintId,
        description: <FieldDescription id={hintId} className="flex flex-col gap-1">
          <span>Choose one or more. One place can be all three.</span>
          <span>Warehouse: appears in From warehouse on Replenishment and Portal fulfillment warehouse.</span>
          <span>Taproom: appears on the tap board, weekly count, variance and Replenishment. Taproom staff see stock only at these locations.</span>
        </FieldDescription>,
      })}
      {E.info(BINS_NOTE)}
    </>
  );
}

export function LocationView({
  model,
  headerAction,
  footer,
  readOnly,
  bins,
}: {
  model: LocationViewModel;
  headerAction?: ReactNode;
  footer?: ReactNode;
  /** The location's Bins section, drawn last. */
  bins?: ReactNode;
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
          {E.info(BINS_NOTE)}
        </>
      ) : (
        <>
          <LocationFields name={model.name} uses={model.uses} />
          {E.fld("Timezone", model.timezone)}
        </>
      )}
      {footer !== undefined ? footer : (readOnly ? null : E.btn("Save location"))}
      {bins}
    </>
  );
}
