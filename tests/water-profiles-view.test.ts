// tests/water-profiles-view.test.ts — list_water_profiles rows → Water profiles view-model (issue #278).
import { describe, expect, it } from "vitest";
import { IONS, ionLine, toWaterProfilesViewProps, type WaterProfile } from "@/lib/mgr/water-profiles-view";
import { IONS as CHEMISTRY_IONS, ION_LABELS } from "@/lib/water-chemistry";

const hazy: WaterProfile = { id: "p1", name: "Hazy target", calcium_ppm: 110, magnesium_ppm: 10, sodium_ppm: 15, sulfate_ppm: 90, chloride_ppm: 180, bicarbonate_ppm: 40 };

describe("water profiles view", () => {
  it("prints the six ions the way the inventory draws them", () => {
    expect(ionLine(hazy)).toBe("Calcium 110 · Magnesium 10 · Sodium 15 · Sulfate 90 · Chloride 180 · Bicarbonate 40");
    expect(toWaterProfilesViewProps({ profiles: [hazy] }).rows).toEqual([{ key: "p1", title: "Hazy target", detail: ionLine(hazy) }]);
  });
  it("takes its ions and labels from the water formula's one list", () => {
    expect(IONS.map(([key, label, input]) => [key, label, input])).toEqual(
      CHEMISTRY_IONS.map((ion) => [`${ion}_ppm`, ION_LABELS[ion], `${ion}Ppm`]),
    );
    expect(IONS[0]).toEqual(["calcium_ppm", "Calcium", "calciumPpm"]);
  });
  it("no profiles is the empty state", () => {
    expect(toWaterProfilesViewProps({ profiles: [] }).empty?.title).toBe("No water profiles yet");
  });
});
