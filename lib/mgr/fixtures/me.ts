// lib/mgr/fixtures/me.ts — staff Me snapshot (Maria, admin).
import type { MeViewModel } from "@/lib/mgr/me-view";
import { toUnitsViewProps } from "@/lib/mgr/units-view";
import { unitsPlato } from "@/lib/mgr/fixtures/settings-catalog";

export const meMaria: MeViewModel = {
  name: "Maria Alvarez",
  roles: ["admin"],
  email: "maria@demobrewing.com",
  breweries: [
    { name: "Demo Brewing", current: true },
    { name: "Ridgeline Contract Brewing", current: false },
  ],
  units: toUnitsViewProps(unitsPlato),
};
