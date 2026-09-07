// app/(app)/settings/units/page.tsx — how this brewery reads and types
// gravity. Two controls over one value: the brewery default (admins only —
// set_brewery_gravity_unit) and the signed-in person's own override
// (set_my_gravity_unit, any staff role, "Use brewery default" clears it).
// Nothing here changes stored data: every gravity in MGR is stored in degrees
// Plato and stays that way (lib/mgr/gravity-unit.ts does the display half).
// Reads through the registry (get_gravity_unit); failures throw to the (app)
// error boundary.
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { formatGravity, gravityUnitLabel, type GravityUnit } from "@/lib/mgr/gravity-unit";
import { GravityUnitForm } from "./gravity-unit-form";

type Effective = { brewery: GravityUnit; mine: GravityUnit | null; effective: GravityUnit };

export default async function UnitsPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const units = (await runCommand("get_gravity_unit", {}, ctx)) as Effective;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Units</h1>

      <p className="text-sm text-muted-foreground">
        Gravity is always stored in degrees Plato. This only changes how it is shown
        and how you type it — an existing reading never moves. A fermentation reading
        of 12.5 °Plato reads as{" "}
        <span className="font-medium text-foreground">{formatGravity(12.5, units.effective)}</span> for you today.
      </p>

      <GravityUnitForm
        brewery={units.brewery}
        mine={units.mine}
        canSetBrewery={ctx.role === "admin"}
        breweryLabel={gravityUnitLabel(units.brewery)}
      />
    </div>
  );
}
