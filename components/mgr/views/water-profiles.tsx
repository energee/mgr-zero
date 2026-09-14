// components/mgr/views/water-profiles.tsx — Water profiles list. Live slots the
// Add profile and per-row Edit sheets; inventory draws the verbs unlinked.
import { type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { WaterProfilesViewModel } from "@/lib/mgr/water-profiles-view";

export type { WaterProfilesViewModel };

export function WaterProfilesView({ model, createAction, rowAction }: { model: WaterProfilesViewModel; createAction?: ReactNode; rowAction?: (key: string) => ReactNode }) {
  return (
    <>
      {E.back("Catalog", "Water profiles", createAction !== undefined ? createAction : E.btn("Add profile"), model.backHref)}
      {model.empty ? E.blank(model.empty) : model.rows.map((row) => <div key={row.key}>{E.row(row.title, row.detail, rowAction ? rowAction(row.key) : E.act("Edit"))}</div>)}
    </>
  );
}
