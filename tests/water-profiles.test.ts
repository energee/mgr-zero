// tests/water-profiles.test.ts — water_profiles (issue #278): a catalog entity
// of six ions in ppm, created and edited by one upsert; brewer or admin.
// #1205 adds optional notes, alkalinity as CaCO3 and the water's own pH.
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
  // #1205: notes, alkalinity as CaCO3 and the water's own pH, all optional.
  it("round-trips notes, alkalinity and water pH, and an edit without them clears them", async () => {
    const denver = (await runCommand("upsert_water_profile", { name: "Denver tap", ...ions, alkalinityPpm: 92.5, waterPh: 7.8, note: "  2026 city report  " }, ctx)) as { id: string };
    expect(denver).toMatchObject({ alkalinity_ppm: 92.5, water_ph: 7.8, note: "2026 city report" });
    const listed = ((await runCommand("list_water_profiles", {}, ctx)) as { id: string }[]).find((p) => p.id === denver.id);
    expect(listed).toMatchObject({ alkalinity_ppm: 92.5, water_ph: 7.8, note: "2026 city report" });
    const cleared = await runCommand("upsert_water_profile", { profileId: denver.id, name: "Denver tap", ...ions, note: "   " }, ctx);
    expect(cleared).toMatchObject({ alkalinity_ppm: null, water_ph: null, note: null });
  });
  it("refuses a pH outside 0–14, negative alkalinity and an overlong note, in the command and in the database", async () => {
    await expect(runCommand("upsert_water_profile", { name: "Acid", ...ions, waterPh: 14.1 }, ctx)).rejects.toThrow();
    await expect(runCommand("upsert_water_profile", { name: "Acid", ...ions, alkalinityPpm: -1 }, ctx)).rejects.toThrow();
    await expect(runCommand("upsert_water_profile", { name: "Acid", ...ions, note: "x".repeat(2001) }, ctx)).rejects.toThrow();
    const rpc = (over: { p_ph?: number; p_alkalinity?: number; p_note?: string }) => ctx.db.rpc("upsert_water_profile", {
      p_brewery: b.id, p_profile: null, p_name: "Direct", p_calcium: 1, p_magnesium: 1, p_sodium: 1, p_sulfate: 1, p_chloride: 1, p_bicarbonate: 1,
      p_alkalinity: null, p_ph: null, p_note: null, p_request_id: crypto.randomUUID(), ...over,
    });
    for (const bad of [{ p_ph: 14.5 }, { p_ph: -0.5 }, { p_alkalinity: -1 }, { p_note: "x".repeat(2001) }, { p_note: "  " }]) {
      expect((await rpc(bad)).error?.code).toBe("23514");
    }
  });
});
