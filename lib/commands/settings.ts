// lib/commands/settings.ts — brewery-wide and per-person display preferences.
// Today that is one setting: the unit a brewer reads and types gravity in.
// Gravity is STORED in degrees Plato everywhere and nothing here changes that
// (Ted's ruling, 2026-09-07); these commands only decide what the screens
// print and how a typed value is read back (lib/mgr/gravity-unit.ts does that
// half). The brewery default lives on breweries.gravity_unit, a member's
// override on their own brewery_users row, and null there means "follow the
// brewery".
import { z } from "zod";
import { defineCommand, defineQuery, unwrap, STAFF_ROLES } from "./registry";
import { GRAVITY_UNITS, type GravityUnit } from "@/lib/mgr/gravity-unit";

defineQuery({
  name: "get_gravity_unit",
  description: "The gravity display unit in force for the caller: the brewery default, their own override (null = none), and the effective one",
  input: z.object({}),
  roles: STAFF_ROLES,
  handler: async (ctx) => {
    const [brewery, membership] = await Promise.all([
      unwrap(ctx.db.from("breweries").select("gravity_unit").eq("id", ctx.breweryId).single()),
      unwrap(ctx.db.from("brewery_users").select("gravity_unit")
        .eq("brewery_id", ctx.breweryId).eq("user_id", ctx.userId).single()),
    ]);
    const breweryUnit = (brewery?.gravity_unit ?? "plato") as GravityUnit;
    const mine = (membership?.gravity_unit ?? null) as GravityUnit | null;
    return { brewery: breweryUnit, mine, effective: mine ?? breweryUnit };
  },
});

defineCommand({
  name: "set_brewery_gravity_unit",
  description: "Set the brewery-wide default unit gravity is shown and entered in (storage stays degrees Plato)",
  input: z.object({ unit: z.enum(GRAVITY_UNITS) }),
  roles: ["admin"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("set_brewery_gravity_unit", {
    p_brewery: ctx.breweryId, p_unit: i.unit, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "set_my_gravity_unit",
  description: "Set your own gravity display unit, or null to follow the brewery default",
  input: z.object({ unit: z.enum(GRAVITY_UNITS).nullable() }),
  roles: STAFF_ROLES,
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("set_my_gravity_unit", {
    p_brewery: ctx.breweryId, p_unit: i.unit, p_request_id: execution.requestId,
  })),
});
