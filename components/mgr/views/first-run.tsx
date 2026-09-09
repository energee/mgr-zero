// components/mgr/views/first-run.tsx — First-run checklist. Live slots
// LocationForm / InviteForm / Add brand; inventory draws the expanded step 1.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { FirstRunViewModel } from "@/lib/mgr/first-run-view";

export type { FirstRunViewModel };

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
          {E.fld("Location name", "Warehouse")}
          {E.chips(["Warehouse", "Taproom"])}
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
