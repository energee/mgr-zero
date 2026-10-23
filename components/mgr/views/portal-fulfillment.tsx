"use client";

// The Wholesale fulfillment section of Settings: the portal's warehouse picker,
// its own form saved only by Save warehouse. Shared by the Settings inventory
// frame and the live form; live passes onSave/busy/error, the fixture passes none.
// Only a location whose Uses include Warehouse is offered, so an empty picker
// says that and links Edit locations (#1147).

import { useState } from "react";
import { E, type PickEmpty } from "@/components/mgr/e";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import { CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { submitReason } from "@/lib/mgr/submit-reason";

const NO_WAREHOUSE = "No location has the Warehouse use yet.";

/** `locationsHref` is Locations for a viewer who may edit a location's uses,
 *  null for one who may not; the inventory leaves it out. */
export function PortalFulfillmentView({ locations, currentId, onSave, busy = false, error = null, locationsHref }: {
  locations: { id: string; name: string }[];
  currentId: string | null;
  onSave?: (locationId: string) => void;
  busy?: boolean;
  error?: string | null;
  locationsHref?: string | null;
}) {
  const [locationId, setLocationId] = useState(currentId ?? "");
  const empty: PickEmpty = locationsHref === null
    ? { text: `${NO_WAREHOUSE} An admin adds the Warehouse use to a location in Locations.` }
    : { text: `${NO_WAREHOUSE} Add the Warehouse use to a location, then choose it here.`, label: "Edit locations", href: locationsHref, to: "Locations" };
  return <form onSubmit={event => { event.preventDefault(); onSave?.(locationId); }}>
    <FieldSet className="min-w-0">
      <FieldLegend><h2 className="font-heading text-xl font-semibold">Wholesale fulfillment</h2></FieldLegend>
      {E.pick("Portal fulfillment warehouse", locationId, [{ value: "", label: "Choose warehouse", disabled: true }, ...locations.map(location => ({ value: location.id, label: location.name }))], { id: "portal-warehouse", required: true, disabled: busy || !locations.length, onChange: setLocationId, empty })}
      <CommandFormMessage error={error} />
      <CommandFormFooter>{E.submit("Save warehouse", { submitting: busy, reason: submitReason(locationId ? [] : ["a warehouse"]) })}</CommandFormFooter>
    </FieldSet>
  </form>;
}
