// tests/water-profiles-view.test.ts — list_water_profiles rows → Water profiles view-model (issue #278).
import { describe, expect, it } from "vitest";
import { ionLine, toWaterProfilesViewProps, type WaterProfile } from "@/lib/mgr/water-profiles-view";

const hazy: WaterProfile = { id: "p1", name: "Hazy target", calcium_ppm: 110, magnesium_ppm: 10, sodium_ppm: 15, sulfate_ppm: 90, chloride_ppm: 180, bicarbonate_ppm: 40 };

describe("water profiles view", () => {
  it("prints the six ions the way the inventory draws them", () => {
    expect(ionLine(hazy)).toBe("Calcium 110 · Magnesium 10 · Sodium 15 · Sulfate 90 · Chloride 180 · Bicarbonate 40");
    expect(toWaterProfilesViewProps({ profiles: [hazy] }).rows).toEqual([{ key: "p1", title: "Hazy target", detail: ionLine(hazy) }]);
  });
  it("no profiles is the empty state", () => {
    expect(toWaterProfilesViewProps({ profiles: [] }).empty?.title).toBe("No water profiles yet");
  });
});
