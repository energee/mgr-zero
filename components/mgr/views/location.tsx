// components/mgr/views/location.tsx — Location detail drawing. Inventory
// paints edits + Save. Live is read-only flds with LocationForm in the header.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { LocationViewModel } from "@/lib/mgr/location-view";

export type { LocationViewModel };

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
          {E.fld("Type", model.type)}
          {E.fld("Timezone", model.timezone)}
          {E.row("Location bins", model.bins, E.act("Open", "primary", model.binsHref))}
        </>
      ) : (
        <>
          {E.edit("Location name", model.name)}
          {E.pick("Type", model.type, model.typeOptions)}
          {E.fld("Timezone", model.timezone)}
          {E.nav("Location bins", model.bins)}
        </>
      )}
      {footer ?? (readOnly ? null : E.btn("Save location"))}
    </>
  );
}
