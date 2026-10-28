"use client";

// The Wholesale fulfillment section of Settings: the portal's warehouse picker.
// Picking a warehouse is the save (#1509); a failed save puts the picker back.
// Shared by the Settings inventory frame and the live form; live passes
// onSave/busy/error, the fixture passes none.
// Only a location whose Uses include Warehouse is offered, so an empty picker
// says that and links Edit locations (#1147).

import { useState } from "react";
import { E, type PickEmpty } from "@/components/mgr/e";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import { CommandFormMessage } from "@/components/mgr/command-form";

/** `locationsHref` is the Edit locations link target; the inventory leaves it
 *  out. A saved `currentId` that is no longer offered (its location lost the
 *  Warehouse use) starts unchosen, so the picker asks for a warehouse instead
 *  of showing a source the server refuses. `onSave` resolves false when the
 *  save failed. */
export function PortalFulfillmentView({ locations, currentId, onSave, busy = false, error = null, locationsHref }: {
  locations: { id: string; name: string }[];
  currentId: string | null;
  onSave?: (locationId: string) => Promise<boolean>;
  busy?: boolean;
  error?: string | null;
  locationsHref?: string;
}) {
  const [locationId, setLocationId] = useState(locations.find(location => location.id === currentId)?.id ?? "");
  const empty: PickEmpty = { text: "No location has Warehouse in its Uses. Add Warehouse to a location's Uses, then choose it here.", label: "Edit locations", href: locationsHref, to: "Locations" };
  const pick = (next: string) => {
    if (busy || next === locationId) return;
    const previous = locationId;
    setLocationId(next);
    void onSave?.(next).then(ok => { if (!ok) setLocationId(previous); });
  };
  return <FieldSet className="min-w-0">
    <FieldLegend><h2 className="font-heading text-xl font-semibold">Wholesale fulfillment</h2></FieldLegend>
    {E.pick("Portal fulfillment warehouse", locationId, [{ value: "", label: "Choose warehouse", disabled: true }, ...locations.map(location => ({ value: location.id, label: location.name }))], { id: "portal-warehouse", required: true, disabled: busy || !locations.length, onChange: pick, empty })}
    <CommandFormMessage error={error} />
  </FieldSet>;
}
