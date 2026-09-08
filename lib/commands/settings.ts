// lib/commands/settings.ts — brewery-wide and per-person display preferences.
// The gravity unit a brewer reads and types in, and (Program 10) the
// brewery basics Settings edits: get_brewery / update_brewery.
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

const readingDueHours = z.number().int().min(1).max(168);
const BREWERY_COLUMNS = "id, name, timezone, ttb_registry_no, pa_license_no, customer_phone, fermentation_reading_due_hours, gravity_unit, portal_fulfillment_location_id";

defineQuery({
  name: "get_brewery",
  description: "The current brewery's basics: name, timezone, TTB registry number, PA license, customer-facing phone, reading-overdue hours, gravity unit and portal fulfillment warehouse",
  input: z.object({}), roles: STAFF_ROLES,
  handler: (ctx) => unwrap(ctx.db.from("breweries").select(BREWERY_COLUMNS).eq("id", ctx.breweryId).single()),
});

defineCommand({
  name: "update_brewery",
  description: "Edit the brewery's basics from Settings (admin): name, timezone, TTB registry number, PA license, the customer-facing phone the portal prints, and how many hours until a fermentation reading is overdue",
  roles: ["admin"],
  input: z.object({
    name: z.string().trim().min(1), timezone: z.string().trim().min(1),
    ttbRegistryNo: z.string().trim().optional(), paLicenseNo: z.string().trim().optional(), customerPhone: z.string().trim().optional(),
    readingDueHours,
  }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("update_brewery", {
    p_brewery: ctx.breweryId, p_name: i.name, p_timezone: i.timezone, p_ttb_registry_no: i.ttbRegistryNo || null,
    p_pa_license_no: i.paLicenseNo || null, p_customer_phone: i.customerPhone || null, p_reading_due_hours: i.readingDueHours,
    p_request_id: execution.requestId,
  })),
});

// Cadence has one stored value and one database constraint (1–168 hours).
defineQuery({
  name: "get_brewery_operating_defaults", description: "Read the brewery timezone and fermentation reading cadence",
  input: z.object({}), roles: ["admin"],
  handler: (ctx) => unwrap(ctx.db.from("breweries").select("timezone, fermentation_reading_due_hours").eq("id", ctx.breweryId).single()),
});
defineCommand({
  name: "set_brewery_operating_defaults", description: "Change only the brewery fermentation reading cadence, in hours",
  input: z.object({ readingDueHours }), roles: ["admin"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("set_brewery_operating_defaults", {
    p_brewery: ctx.breweryId, p_reading_due_hours: i.readingDueHours, p_request_id: execution.requestId,
  })),
});
