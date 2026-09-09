// app/(app)/settings/units/page.tsx — Units (screen record): how this
// brewery reads and types gravity. Two controls over one value: the brewery
// default (admins only — set_brewery_gravity_unit) and the signed-in
// person's own override (set_my_gravity_unit, any staff role, "Use brewery
// default" clears it), both in gravity-unit-form.tsx. Nothing here changes
// stored data: every gravity in MGR is stored in degrees Plato and stays
// that way (lib/mgr/gravity-unit.ts does the display half).
import { UnitsView } from "@/components/mgr/views/units";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toUnitsViewProps } from "@/lib/mgr/units-view";
import "@/lib/commands/all";
import type { GravityUnit } from "@/lib/mgr/gravity-unit";
import { GravityUnitForm } from "./gravity-unit-form";

type Effective = { brewery: GravityUnit; mine: GravityUnit | null; effective: GravityUnit };

export default async function UnitsPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const units = (await runCommand("get_gravity_unit", {}, ctx)) as Effective;
  return (
    <UnitsView backLabel={ctx.role === "taproom" ? "More" : "Settings"}
      model={toUnitsViewProps({ ...units, backHref: ctx.role === "taproom" ? "/more" : "/settings" })}
      controls={<GravityUnitForm brewery={units.brewery} mine={units.mine} canSetBrewery={ctx.role === "admin"} />}
    />
  );
}
