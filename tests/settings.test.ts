// tests/settings.test.ts — per-user display preferences that sit over a
// brewery default. Gravity is stored in °Plato no matter what is chosen here
// (lib/mgr/gravity-unit.ts does the display half); these commands only decide
// what a person sees and types. The brewery setter is admin-only, the personal
// one is any staff role, and neither reaches another brewery.
import { beforeAll, describe, expect, it } from "vitest";
import { admin, makeBrewery, makeStaffCtx, sql } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

type Effective = { brewery: "plato" | "sg"; mine: "plato" | "sg" | null; effective: "plato" | "sg" };

let b: { id: string };
let adminCtx: Awaited<ReturnType<typeof makeStaffCtx>>;
let brewerCtx: Awaited<ReturnType<typeof makeStaffCtx>>;
let taproomCtx: Awaited<ReturnType<typeof makeStaffCtx>>;

beforeAll(async () => {
  b = await makeBrewery();
  adminCtx = await makeStaffCtx(b.id, "admin");
  brewerCtx = await makeStaffCtx(b.id, "brewer");
  taproomCtx = await makeStaffCtx(b.id, "taproom");
});

describe("gravity unit preference", () => {
  it("defaults to the brewery default, which starts at Plato", async () => {
    const got = (await runCommand("get_gravity_unit", {}, brewerCtx)) as Effective;
    expect(got).toEqual({ brewery: "plato", mine: null, effective: "plato" });
  });

  it("an admin sets the brewery default and a user with no override follows it", async () => {
    await runCommand("set_brewery_gravity_unit", { unit: "sg" }, adminCtx);
    const got = (await runCommand("get_gravity_unit", {}, brewerCtx)) as Effective;
    expect(got).toEqual({ brewery: "sg", mine: null, effective: "sg" });
  });

  it("a personal preference wins over the brewery default, and null clears it", async () => {
    await runCommand("set_my_gravity_unit", { unit: "plato" }, brewerCtx);
    expect(await runCommand("get_gravity_unit", {}, brewerCtx)).toEqual({ brewery: "sg", mine: "plato", effective: "plato" });
    // The override is this user's alone — the admin still reads the default.
    expect(await runCommand("get_gravity_unit", {}, adminCtx)).toEqual({ brewery: "sg", mine: null, effective: "sg" });

    await runCommand("set_my_gravity_unit", { unit: null }, brewerCtx);
    expect(await runCommand("get_gravity_unit", {}, brewerCtx)).toEqual({ brewery: "sg", mine: null, effective: "sg" });
  });

  it("refuses the brewery setter to a non-admin", async () => {
    await expect(runCommand("set_brewery_gravity_unit", { unit: "plato" }, brewerCtx)).rejects.toThrow();
  });

  it("refuses a setter aimed at another brewery", async () => {
    const other = await makeBrewery();
    const outsider = { ...adminCtx, breweryId: other.id };
    await expect(runCommand("set_brewery_gravity_unit", { unit: "sg" }, outsider)).rejects.toThrow();
    await expect(runCommand("set_my_gravity_unit", { unit: "sg" }, outsider)).rejects.toThrow();
  });
});

describe("brewery settings (Program 10 task 4)", () => {
  it("get_brewery reads the row for any staff role; update_brewery is admin-only and replays", async () => {
    const before = (await runCommand("get_brewery", {}, brewerCtx)) as { name: string; customer_phone: string | null };
    expect(before.customer_phone).toBeNull();
    // Not "Demo Brewing": scripts/seed-dev.ts looks that name up with maybeSingle(),
    // so a test renaming a brewery to it breaks the local browse seed once the
    // suite has run against the same database.
    const input = { name: "Renamed Brewing", timezone: "America/Chicago", ttbRegistryNo: "BR-PA-12345", paLicenseNo: "G-1234", customerPhone: "(610) 555-0142", readingDueHours: 36 };
    await expect(runCommand("update_brewery", input, brewerCtx)).rejects.toThrow(/permission denied/);
    const after = (await runCommand("update_brewery", input, adminCtx)) as { name: string; timezone: string; customer_phone: string; fermentation_reading_due_hours: number };
    expect(after).toMatchObject({ name: "Renamed Brewing", timezone: "America/Chicago", customer_phone: "(610) 555-0142", fermentation_reading_due_hours: 36 });
    expect((await runCommand("get_brewery", {}, brewerCtx)) as object).toMatchObject({ name: "Renamed Brewing", ttb_registry_no: "BR-PA-12345" });
    await expect(runCommand("update_brewery", { ...input, timezone: "Mars/Olympus" }, adminCtx)).rejects.toThrow();
  });

  it("stores one brewery-wide AI model and exposes it to staff", async () => {
    expect(await runCommand("get_brewery_ai_model", {}, brewerCtx)).toEqual({ model: "minimax/minimax-m3.1-flash" });
    await expect(runCommand("set_brewery_ai_model", { model: "openai/gpt-5.4" }, brewerCtx)).rejects.toThrow(/permission denied/);
    await runCommand("set_brewery_ai_model", { model: "openai/gpt-5.4" }, adminCtx);
    expect(await runCommand("get_brewery_ai_model", {}, brewerCtx)).toEqual({ model: "openai/gpt-5.4" });
    expect(await runCommand("get_brewery_ai_model", {}, taproomCtx)).toEqual({ model: "openai/gpt-5.4" });
    await expect(runCommand("set_brewery_ai_model", { model: "not a model" }, adminCtx)).rejects.toThrow();
  });
});

describe("projected packaging operating defaults", () => {
  it("defaults to fourteen days, saves both defaults once, and exposes packaging days to staff", async () => {
    const brewery = await makeBrewery();
    const owner = await makeStaffCtx(brewery.id);
    const brewer = await makeStaffCtx(brewery.id, "brewer");
    expect(await runCommand("get_brewery", {}, brewer)).toMatchObject({ days_to_package: 14 });
    const execution = { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
    const input = { readingDueHours: 36, daysToPackage: 21 };
    const saved = await runCommand("set_brewery_operating_defaults", input, owner, execution);
    expect(await runCommand("set_brewery_operating_defaults", input, owner, execution)).toEqual(saved);
    await expect(runCommand("set_brewery_operating_defaults", { ...input, daysToPackage: 22 }, owner, execution)).rejects.toThrow(/different payload/);
    expect(await runCommand("get_brewery", {}, brewer)).toMatchObject({ fermentation_reading_due_hours: 36, days_to_package: 21 });
    const stored = await admin.from("breweries").select("fermentation_reading_due_hours, days_to_package").eq("id", brewery.id).single();
    expect(stored.error).toBeNull();
    expect(stored.data).toEqual({ fermentation_reading_due_hours: 36, days_to_package: 21 });
    await runCommand("set_brewery_operating_defaults", { readingDueHours: 48 }, owner);
    expect(await runCommand("get_brewery", {}, brewer)).toMatchObject({ fermentation_reading_due_hours: 48, days_to_package: 21 });
  });

  it("enforces integer packaging days from one to 120 at command and database boundaries without changing either default", async () => {
    const brewery = await makeBrewery();
    const owner = await makeStaffCtx(brewery.id);
    await runCommand("set_brewery_operating_defaults", { readingDueHours: 36, daysToPackage: 21 }, owner);
    for (const daysToPackage of [0, 121, 1.5]) {
      await expect(runCommand("set_brewery_operating_defaults", { readingDueHours: 48, daysToPackage }, owner)).rejects.toThrow();
    }
    for (const p_days_to_package of [0, 121]) {
      const invalid = await owner.db.rpc("set_brewery_operating_defaults", {
        p_brewery: brewery.id, p_reading_due_hours: 48, p_days_to_package, p_request_id: crypto.randomUUID(),
      });
      expect(invalid.error).not.toBeNull();
    }
    expect(await runCommand("get_brewery", {}, owner)).toMatchObject({ fermentation_reading_due_hours: 36, days_to_package: 21 });
    for (const daysToPackage of [1, 120]) {
      await runCommand("set_brewery_operating_defaults", { readingDueHours: 36, daysToPackage }, owner);
      expect(await runCommand("get_brewery", {}, owner)).toMatchObject({ days_to_package: daysToPackage });
    }
  });

  it("keeps operating defaults admin-only and prevents a forged foreign brewery from changing them", async () => {
    const brewery = await makeBrewery();
    const owner = await makeStaffCtx(brewery.id);
    const brewer = await makeStaffCtx(brewery.id, "brewer");
    const input = { readingDueHours: 36, daysToPackage: 21 };
    await expect(runCommand("set_brewery_operating_defaults", input, brewer)).rejects.toThrow(/permission denied/);
    const denied = await brewer.db.rpc("set_brewery_operating_defaults", {
      p_brewery: brewery.id, p_reading_due_hours: 36, p_days_to_package: 21, p_request_id: crypto.randomUUID(),
    });
    expect(denied.error).not.toBeNull();
    const foreign = await makeBrewery();
    await expect(runCommand("set_brewery_operating_defaults", input, { ...owner, breweryId: foreign.id })).rejects.toThrow();
    const untouched = await admin.from("breweries").select("days_to_package").eq("id", foreign.id).single();
    expect(untouched.error).toBeNull();
    expect(untouched.data).toEqual({ days_to_package: 14 });
  });

  it("replays a previously accepted reading-hours-only request unchanged and leaves newer packaging defaults alone", async () => {
    const brewery = await makeBrewery();
    const owner = await makeStaffCtx(brewery.id);
    await runCommand("set_brewery_operating_defaults", { readingDueHours: 48, daysToPackage: 21 }, owner);
    const requestId = crypto.randomUUID();
    sql(`insert into private.command_requests(actor_id,brewery_id,request_id,command_name,payload_hash,result)
      values('${owner.userId}','${brewery.id}','${requestId}','set_brewery_operating_defaults',
        extensions.digest(jsonb_build_object('hours',36)::text,'sha256'),'{"ok":true}'::jsonb)`);
    const execution = { requestId, correlationId: requestId };
    expect(await runCommand("set_brewery_operating_defaults", { readingDueHours: 36 }, owner, execution)).toEqual({ ok: true });
    await expect(runCommand("set_brewery_operating_defaults", { readingDueHours: 36, daysToPackage: 14 }, owner, execution)).rejects.toThrow(/different payload/);
    expect(await runCommand("get_brewery", {}, owner)).toMatchObject({ fermentation_reading_due_hours: 48, days_to_package: 21 });
  });
});
