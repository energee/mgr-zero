// components/mgr/views/first-run.tsx — First-run checklist. Live slots
// LocationForm / InviteForm / New brand; inventory draws the expanded step 1
// with the same LocationFields the Add location dialog mounts.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { FirstRunViewModel } from "@/lib/mgr/first-run-view";
import { LocationFields } from "./location";

export function FirstRunView({
  model,
  steps,
}: {
  model: FirstRunViewModel;
  /** Live checklist rows. Inventory draws the expanded Add location step. */
  steps?: ReactNode;
}) {
  return (
    <>
      {E.hd(`Set up ${model.brewery}`, model.steps)}
      {steps ?? (
        <>
          {E.row("1 · Add locations", "inline form expanded", "in progress", "ok")}
          <LocationFields name="Warehouse" uses={["warehouse"]} />
          {E.btn("Add location")}
          {E.row("2 · Import CSV", "customers, catalog or opening balances", E.act("Import CSV"))}
          {E.row("3 · Add a brand", "or let the import create them", E.act("Add"))}
          {E.row("4 · Invite the team", "optional · email and one role", E.act("Invite staff"))}
          {E.row("5 · Opening inventory", "count what’s on hand today", E.act("Record opening count", "info"))}
        </>
      )}
    </>
  );
}
