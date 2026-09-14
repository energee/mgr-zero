// components/mgr/views/water-profiles.tsx — Water profiles list. Live slots the
// Add profile sheet and one Edit sheet per row (keyed by profile id, as
// keg-fleet keys poolActions); inventory draws the verbs unlinked.
import { type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { WaterProfilesViewModel } from "@/lib/mgr/water-profiles-view";

export type { WaterProfilesViewModel };

export function WaterProfilesView({ model, createAction, profileActions }: { model: WaterProfilesViewModel; createAction?: ReactNode; profileActions?: Record<string, ReactNode> }) {
  return (
    <>
      {E.back("Catalog", "Water profiles", createAction !== undefined ? createAction : E.btn("Add profile"), model.backHref)}
      {model.empty ? E.blank(model.empty) : model.rows.map((row) => <div key={row.key}>{E.row(row.title, row.detail, profileActions ? profileActions[row.key] : E.act("Edit"))}</div>)}
    </>
  );
}
