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

/** `locationsHref` is the Edit locations link target; the inventory leaves it
 *  out. A saved `currentId` that is no longer offered (its location lost the
 *  Warehouse use) starts unchosen, so Save warehouse says what it still needs
 *  instead of sending a source the server refuses. */
export function PortalFulfillmentView({ locations, currentId, onSave, busy = false, error = null, locationsHref }: {
  locations: { id: string; name: string }[];
  currentId: string | null;
  onSave?: (locationId: string) => void;
  busy?: boolean;
  error?: string | null;
  locationsHref?: string;
}) {
  const [locationId, setLocationId] = useState(locations.find(location => location.id === currentId)?.id ?? "");
  const empty: PickEmpty = { text: "No location has Warehouse in its Uses. Add Warehouse to a location's Uses, then choose it here.", label: "Edit locations", href: locationsHref, to: "Locations" };
  return <form onSubmit={event => { event.preventDefault(); onSave?.(locationId); }}>
    <FieldSet className="min-w-0">
      <FieldLegend><h2 className="font-heading text-xl font-semibold">Wholesale fulfillment</h2></FieldLegend>
      {E.pick("Portal fulfillment warehouse", locationId, [{ value: "", label: "Choose warehouse", disabled: true }, ...locations.map(location => ({ value: location.id, label: location.name }))], { id: "portal-warehouse", required: true, disabled: busy || !locations.length, onChange: setLocationId, empty })}
      <CommandFormMessage error={error} />
      <CommandFormFooter className="@min-[24rem]:flex-row @min-[24rem]:items-center @min-[24rem]:justify-end">{E.submit("Save warehouse", { submitting: busy, reason: submitReason(locationId ? [] : ["a warehouse"]) })}</CommandFormFooter>
    </FieldSet>
  </form>;
}
