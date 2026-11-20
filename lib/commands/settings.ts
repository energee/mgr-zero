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
import { completeRows, isoDate, defineCommand, definePreTenantQuery, defineQuery, PAGE_SIZE, phone, unwrap, STAFF_ROLES } from "./registry";
import { GRAVITY_UNITS, type GravityUnit } from "@/lib/mgr/gravity-unit";
import { KEG_SIZES } from "@/lib/mgr/enums";
import { chatModelFromSettings, DEFAULT_CHAT_MODEL, MODEL_ID } from "@/lib/chat/models";

defineQuery({
  name: "get_gravity_unit",
  description: "The gravity display unit in force for the caller: the brewery default, their own override (null = none), and the effective one",
  input: z.object({}),
  roles: STAFF_ROLES,
  handler: async (ctx) => {
    const [brewery, membership] = await Promise.all([
      unwrap(ctx.db.from("staff_brewery").select("gravity_unit").eq("id", ctx.breweryId).single()),
      unwrap(ctx.db.from("brewery_users").select("gravity_unit")
        .eq("brewery_id", ctx.breweryId).eq("user_id", ctx.userId).single()),
    ]);
    const breweryUnit = (brewery?.gravity_unit ?? "plato") as GravityUnit;
    const mine = (membership?.gravity_unit ?? null) as GravityUnit | null;
    return { brewery: breweryUnit, mine, effective: mine ?? breweryUnit };
  },
});

defineCommand({
  name: "set_brewery_agents_enabled", agentHidden: true,
  description: "Allow or stop outside agents, such as Claude or ChatGPT, for this brewery. Off stops every connected agent at once",
  compensation: "Reverse with set_brewery_agents_enabled and the opposite value.",
  input: z.object({ enabled: z.boolean() }),
  roles: ["admin"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("set_brewery_agents_enabled", {
    p_brewery: ctx.breweryId, p_enabled: i.enabled, p_request_id: execution.requestId,
  })),
});

definePreTenantQuery({
  name: "list_my_agent_breweries",
  description: "The breweries this person works at, each with whether outside agents are allowed there",
  input: z.object({}),
  handler: async (ctx) => {
    const rows = await completeRows("Brewery list", start => ctx.db.from("breweries")
      .select("id, name, timezone, agents_enabled", { count: "exact" }).order("name").order("id").range(start, start + PAGE_SIZE - 1));
    return rows.map(row => ({ id: row.id, name: row.name, timezone: row.timezone, agentsEnabled: row.agents_enabled }));
  },
});

defineCommand({
  name: "set_brewery_gravity_unit",
  description: "Set the brewery-wide default unit gravity is shown and entered in (storage stays degrees Plato)",
  compensation: "Reverse with set_brewery_gravity_unit and the previous unit.",
  input: z.object({ unit: z.enum(GRAVITY_UNITS).describe("The unit gravity is shown and entered in") }),
  roles: ["admin"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("set_brewery_gravity_unit", {
    p_brewery: ctx.breweryId, p_unit: i.unit, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "set_my_gravity_unit",
  description: "Set your own gravity display unit, or null to follow the brewery default",
  compensation: "Reverse with set_my_gravity_unit and the previous unit, or null to follow the brewery.",
  input: z.object({ unit: z.enum(GRAVITY_UNITS).nullable().describe("Your gravity unit; null follows the brewery default") }),
  roles: STAFF_ROLES,
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("set_my_gravity_unit", {
    p_brewery: ctx.breweryId, p_unit: i.unit, p_request_id: execution.requestId,
  })),
});

const readingDueHours = z.number().int().min(1).max(168);
const gatewayModel = z.string().trim().min(3).max(200).regex(MODEL_ID);
const BREWERY_COLUMNS = "id, name, timezone, ttb_registry_no, customer_phone, fermentation_reading_due_hours, days_to_package, gravity_unit, portal_fulfillment_location_id, books_opened_on, agents_enabled, release_open_pct, release_order_by_days, release_cap_lift_days, release_digest_dow, release_share_window_days, release_stock_multiplier, release_max_share_pct, pallet_rules";

defineQuery({
  name: "get_brewery",
  description: "The current brewery's basics: name, timezone, TTB registry number, customer-facing phone, reading-overdue hours, days to package, gravity unit, portal fulfillment warehouse, the books-opened date, the release defaults and the pallet rules",
  input: z.object({}), roles: ["admin", "sales", "warehouse", "brewer"],
  handler: (ctx) => unwrap(ctx.db.from("breweries").select(BREWERY_COLUMNS).eq("id", ctx.breweryId).single()),
});

defineCommand({
  name: "update_brewery",
  description: "Edit the brewery's basics from Settings (admin): name, timezone, TTB registry number, the customer-facing phone the portal prints, and how many hours until a fermentation reading is overdue",
  compensation: "Reverse with update_brewery and the previous values; after the first filing the timezone cannot change.",
  roles: ["admin"],
  input: z.object({
    name: z.string().trim().min(1).describe("The brewery's name"), timezone: z.string().trim().min(1),
    ttbRegistryNo: z.string().trim().optional(), customerPhone: phone.optional(),
    readingDueHours,
  }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("update_brewery", {
    p_brewery: ctx.breweryId, p_name: i.name, p_timezone: i.timezone, p_ttb_registry_no: i.ttbRegistryNo || null,
    p_customer_phone: i.customerPhone || null, p_reading_due_hours: i.readingDueHours,
    p_request_id: execution.requestId,
  })),
});

defineQuery({
  name: "get_brewery_ai_model", description: "Read the brewery-wide AI Gateway model used by Ask MGR",
  input: z.object({}), roles: STAFF_ROLES,
  handler: async (ctx) => {
    const row = await unwrap(ctx.db.from("staff_brewery").select("ai_model").eq("id", ctx.breweryId).single()) as { ai_model: string | null };
    return { model: chatModelFromSettings({ ai_model: row.ai_model }, process.env.AI_GATEWAY_MODEL ?? DEFAULT_CHAT_MODEL) };
  },
});

defineCommand({
  name: "set_brewery_ai_model", description: "Set the brewery-wide AI Gateway model used by Ask MGR",
  compensation: "Reverse with set_brewery_ai_model and the previous model.",
  input: z.object({ model: gatewayModel }), roles: ["admin"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("set_brewery_ai_model", {
    p_brewery: ctx.breweryId, p_model: i.model, p_request_id: execution.requestId,
  })),
});

// Cadence has one stored value and one database constraint (1–168 hours).
defineQuery({
  name: "get_brewery_operating_defaults", description: "Read the brewery timezone and fermentation reading cadence",
  input: z.object({}), roles: ["admin"],
  handler: (ctx) => unwrap(ctx.db.from("breweries").select("timezone, fermentation_reading_due_hours").eq("id", ctx.breweryId).single()),
});
// The day compliance reports start counting. Earlier ledger rows (imported
// history) stay visible everywhere else; null counts everything. The RPC
// freezes the value after any filed snapshot; an unchanged value remains a no-op.
defineCommand({
  name: "set_books_opened_on", description: "Set or clear the day compliance reports start counting the ledger before any report is filed (admin); after filing, only the unchanged value is allowed",
  compensation: "Reverse with set_books_opened_on before the first filing, or correct_reporting_basis after it.",
  input: z.object({ booksOpenedOn: isoDate.nullable() }), roles: ["admin"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("set_brewery_books_opened_on", {
    p_brewery: ctx.breweryId, p_books_opened_on: i.booksOpenedOn, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "set_release_defaults", description: "Set the brewery's release defaults: the percent of a planned batch the release form opens to wholesale, the days before ship that ordering closes by default and that customer ceilings lift, the history window, stock multiplier and maximum for calculated ceilings (a null window calculates none), and the weekday the release digest is sent (null sends none)",
  compensation: "Reverse with set_release_defaults and the previous values.",
  input: z.object({
    openPct: z.number().int().min(1).max(100).describe("Percent of a planned batch opened to wholesale by default"),
    orderByDays: z.number().int().min(0).max(60).describe("Days before ship that ordering closes by default"),
    capLiftDays: z.number().int().min(0).max(90).describe("Days before ship that customer ceilings stop applying"),
    shareWindowDays: z.number().int().min(7).max(730).nullable().describe("Days of purchases a calculated ceiling looks back over; null calculates none"),
    stockMultiplier: z.number().min(1).max(10).multipleOf(0.01).describe("How many times a barrel bought from stock counts toward a calculated ceiling"),
    maxSharePct: z.number().int().min(1).max(100).describe("The most a calculated ceiling can be, in percent of a pool"),
    digestDay: z.number().int().min(0).max(6).nullable().describe("Weekday the release digest is sent, 0 Sunday to 6 Saturday; null sends none"),
  }), roles: ["admin"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("set_release_defaults", {
    p_brewery: ctx.breweryId, p_open_pct: i.openPct, p_order_by_days: i.orderByDays, p_cap_lift_days: i.capLiftDays,
    p_share_window_days: i.shareWindowDays as number, p_stock_multiplier: i.stockMultiplier, p_max_share_pct: i.maxSharePct,
    p_digest_dow: i.digestDay as number, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "set_pallet_rules", description: "Set how the brewery stacks a pallet, which the portal uses for the buyer's pallet line and Fill the pallet: the most a pallet carries in pounds, the tallest a loaded pallet stands and the empty pallet's own height in inches (layers stack in the room between, each as tall as its format's height), and the ways one keg layer loads (each a count per keg size; a pallet carries at most two keg layers). Advisory: nothing is enforced",
  compensation: "Reverse with set_pallet_rules and the previous values.",
  input: z.object({
    maxLb: z.number().int().min(1).max(10000).describe("The most one pallet carries, in pounds"),
    maxHeightIn: z.number().int().min(12).max(120).describe("The tallest a loaded pallet stands from the floor, in inches"),
    palletHeightIn: z.number().min(0).max(24).multipleOf(0.1).describe("The empty pallet's own height in inches, taken off maxHeightIn to get the room for layers"),
    kegLayers: z.array(z.object(Object.fromEntries(KEG_SIZES.map((size) => [size, z.number().int().min(1).max(500).optional().describe("Kegs of this size in the layer; omit for none")]))))
      .max(50).describe("The ways one keg layer loads, each a count per keg size, such as { half_bbl: 6, sixth_bbl: 6 }; empty uses each format's pallet fit"),
  }), roles: ["admin"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("set_pallet_rules", { p_brewery: ctx.breweryId, p_rules: i, p_request_id: execution.requestId })),
});

defineCommand({
  name: "set_brewery_operating_defaults", description: "Change the brewery fermentation reading cadence in hours and optionally its days-to-package estimate for projected batch packaging demand",
  compensation: "Reverse with set_brewery_operating_defaults and the previous values.",
  input: z.object({ readingDueHours, daysToPackage: z.number().int().min(1).max(120).optional().describe("Days from brewing (or the planned brew date) to projected packaging; omit to keep the current value") }), roles: ["admin"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("set_brewery_operating_defaults", {
    p_brewery: ctx.breweryId, p_reading_due_hours: i.readingDueHours, p_request_id: execution.requestId,
    p_days_to_package: i.daysToPackage,
  })),
});
