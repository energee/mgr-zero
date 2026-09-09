import { E } from "@/components/mgr/e";
import { FirstRunView } from "@/components/mgr/views/first-run";
import { toFirstRunViewProps } from "@/lib/mgr/first-run-view";
import { InviteForm } from "./settings/team/invite-form";
import { LocationForm } from "./locations/location-form";

export type FirstRun = { hasLocation: boolean; hasBrand: boolean; hasMovement: boolean; hasStaff: boolean };

export function FirstRunChecklist({ brewery, state }: { brewery: string; state: FirstRun }) {
  return (
    <FirstRunView
      model={toFirstRunViewProps({ brewery, steps: "5 steps" })}
      steps={
        <>
          {E.row("1 · Add locations", "a warehouse, a taproom, or both", state.hasLocation ? "done" : <LocationForm />, state.hasLocation ? "ok" : "")}
          {E.nav("2 · Import CSV", "customers, catalog and opening balances", "", undefined, "/settings/import")}
          {E.row("3 · Add a brand", "the catalog starts with one brand", state.hasBrand ? "done" : E.act("Add", "primary", "/catalog"), state.hasBrand ? "ok" : "")}
          {E.row("4 · Invite the team", state.hasStaff ? "someone joined" : "email and role", state.hasStaff ? "done" : "", state.hasStaff ? "ok" : "")}
          {!state.hasStaff && <InviteForm />}
          {E.row("5 · Opening inventory", "count what’s on hand today", state.hasMovement ? "done" : E.act("Record opening count", "info", "/inventory"), state.hasMovement ? "ok" : "")}
        </>
      }
    />
  );
}
