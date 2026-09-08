// tests/settings.test.ts — per-user display preferences that sit over a
// brewery default. Gravity is stored in °Plato no matter what is chosen here
// (lib/mgr/gravity-unit.ts does the display half); these commands only decide
// what a person sees and types. The brewery setter is admin-only, the personal
// one is any staff role, and neither reaches another brewery.
import { beforeAll, describe, expect, it } from "vitest";
import { makeBrewery, makeStaffCtx } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

type Effective = { brewery: "plato" | "sg"; mine: "plato" | "sg" | null; effective: "plato" | "sg" };

let b: { id: string };
let adminCtx: Awaited<ReturnType<typeof makeStaffCtx>>;
let brewerCtx: Awaited<ReturnType<typeof makeStaffCtx>>;

beforeAll(async () => {
  b = await makeBrewery();
  adminCtx = await makeStaffCtx(b.id, "admin");
  brewerCtx = await makeStaffCtx(b.id, "brewer");
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
});
