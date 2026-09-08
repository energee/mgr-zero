// app/(app)/first-run.tsx — the First-run checklist (screen record): Today's
// body until the brewery has a location and a brand. Each step is one
// command the app already has; Import CSV and Invite the team stay gated
// until Program 11 closes their gates and can be skipped.
import { E } from "@/components/mgr/e";
import { LocationForm } from "./locations/location-form";

export type FirstRun = { hasLocation: boolean; hasBrand: boolean; hasMovement: boolean; hasStaff: boolean };
const GATE = "isn’t available yet; invitations are being made retry-safe. Until it closes a brewery is whoever created it, alone";

export function FirstRunChecklist({ brewery, state }: { brewery: string; state: FirstRun }) {
  const done = (ok: boolean) => (ok ? "done" : "");
  return (
    <>
      {E.hd(`Set up ${brewery}`, "5 steps")}
      {E.row("1 · Add locations", "a warehouse, a taproom, or both", state.hasLocation ? "done" : <LocationForm />, state.hasLocation ? "ok" : "")}
      {E.gated("2 · Import CSV", "CSV import isn’t available yet; add records by hand")}
      {E.row("3 · Add a brand", "the catalog starts with one brand", state.hasBrand ? "done" : E.act("Add", "primary", "/catalog"), state.hasBrand ? "ok" : "")}
      {E.row("4 · Invite the team", state.hasStaff ? "someone joined" : "email and role", done(state.hasStaff), state.hasStaff ? "ok" : "")}
      {!state.hasStaff && E.gated("Send staff invite", GATE)}
      {E.row("5 · Opening inventory", "count what’s on hand today", state.hasMovement ? "done" : E.act("Record opening count", "info", "/inventory"), state.hasMovement ? "ok" : "")}
    </>
  );
}
