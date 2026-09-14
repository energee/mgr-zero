// tests/water-profiles.test.ts — water_profiles (issue #278): a catalog entity
// of six ions in ppm, created and edited by one upsert; brewer or admin.
import { beforeAll, describe, expect, it } from "vitest";
import { makeBrewery, makeStaffCtx } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

let b: { id: string };
let ctx: Awaited<ReturnType<typeof makeStaffCtx>>;
const ions = { calciumPpm: 110, magnesiumPpm: 10, sodiumPpm: 15, sulfatePpm: 90, chloridePpm: 180, bicarbonatePpm: 40 };

beforeAll(async () => {
  b = await makeBrewery();
  ctx = await makeStaffCtx(b.id, "brewer");
});

describe("water profiles", () => {
  it("creates, lists alphabetically, and renames through one upsert", async () => {
    const hazy = (await runCommand("upsert_water_profile", { name: "Hazy target", ...ions }, ctx)) as { id: string; name: string; chloride_ppm: number };
    expect(hazy).toMatchObject({ name: "Hazy target", chloride_ppm: 180 });
    await runCommand("upsert_water_profile", { name: "Burton", ...ions, sulfatePpm: 610 }, ctx);
    const names = ((await runCommand("list_water_profiles", {}, ctx)) as { name: string }[]).map((p) => p.name);
    expect(names).toEqual(["Burton", "Hazy target"]);
    const renamed = (await runCommand("upsert_water_profile", { profileId: hazy.id, name: "Hazy IPA target", ...ions }, ctx)) as { id: string; name: string };
    expect(renamed).toMatchObject({ id: hazy.id, name: "Hazy IPA target" });
  });
  it("refuses a duplicate name, a negative ion, and the warehouse role", async () => {
    await expect(runCommand("upsert_water_profile", { name: "Burton", ...ions }, ctx)).rejects.toThrow();
    await expect(runCommand("upsert_water_profile", { name: "Bad", ...ions, sodiumPpm: -1 }, ctx)).rejects.toThrow();
    const wh = await makeStaffCtx(b.id, "warehouse");
    await expect(runCommand("list_water_profiles", {}, wh)).rejects.toThrow(/permission/);
  });
});
