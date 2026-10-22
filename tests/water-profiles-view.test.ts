// tests/water-profiles-view.test.ts — list_water_profiles rows → Water profiles view-model (issue #278),
// and the copy both sheets draw: names, units and the empty state (#1152).
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WaterProfileView } from "@/components/mgr/views/water-profile";
import { WaterProfilesView } from "@/components/mgr/views/water-profiles";
import { IONS, ionLine, toWaterProfileFields, toWaterProfilesViewProps, waterProfilesBack, type WaterProfile } from "@/lib/mgr/water-profiles-view";
import { IONS as CHEMISTRY_IONS } from "@/lib/water-chemistry";

const hazy: WaterProfile = { id: "p1", name: "Hazy target", calcium_ppm: 110, magnesium_ppm: 10, sodium_ppm: 15, sulfate_ppm: 90, chloride_ppm: 180, bicarbonate_ppm: 40 };

describe("water profiles view", () => {
  it("prints the six ions the way the inventory draws them", () => {
    expect(ionLine(hazy)).toBe("Calcium 110 · Magnesium 10 · Sodium 15 · Sulfate 90 · Chloride 180 · Bicarbonate 40");
    expect(toWaterProfilesViewProps({ profiles: [hazy] }).rows).toEqual([{ key: "p1", title: "Hazy target", detail: ionLine(hazy) }]);
  });
  it("takes its ions and labels from the water formula's one list", () => {
    expect(IONS).toHaveLength(CHEMISTRY_IONS.length);
    expect(IONS[0]).toEqual(["calcium_ppm", "Calcium", "calciumPpm"]);
    expect(IONS[5]).toEqual(["bicarbonate_ppm", "Bicarbonate", "bicarbonatePpm"]);
  });
  // #1152: a profile has no source/target kind; a recipe version picks sourceProfileId and targetProfileId.
  it("no profiles is the empty state, which says a recipe version picks the source and the target", () => {
    expect(toWaterProfilesViewProps({ profiles: [] }).empty).toEqual({
      title: "No water profiles yet",
      description: "Add your source water or a target for a style. A recipe version picks its source and its target from this list.",
    });
  });
  it("names the water profile the same way on the list, the sheet and the live form", () => {
    const list = renderToStaticMarkup(createElement(WaterProfilesView, { model: toWaterProfilesViewProps({ profiles: [] }) }));
    expect(list).toContain("Add water profile");
    const sheet = renderToStaticMarkup(createElement(WaterProfileView, { fields: toWaterProfileFields(hazy) }));
    expect(sheet).toContain("Save water profile");
    const live = readFileSync("app/(app)/catalog/water-profiles/water-profile-form.tsx", "utf8");
    for (const verb of ["Add water profile", "Edit water profile", "Save water profile"]) expect(live).toContain(`"${verb}"`);
    expect(`${list}${sheet}${live}`).not.toMatch(/"(Add|Save) profile"|>(Add|Save) profile</);
  });
  it("labels each ion with its unit and says all six are required ppm, never negative", () => {
    const sheet = renderToStaticMarkup(createElement(WaterProfileView, { fields: toWaterProfileFields(hazy) }));
    for (const [, label] of IONS) expect(sheet).toContain(`${label} (ppm)`);
    expect(sheet).toContain("All six ions are required, in parts per million (ppm, the same as mg/L). None can be negative.");
  });
  it("sends Brewer back to Recipes, since Brewer cannot open Catalog", () => {
    expect(waterProfilesBack(["brewer"])).toEqual({ label: "Recipes", href: "/recipes" });
    expect(waterProfilesBack(["brewer", "taproom"])).toEqual({ label: "Recipes", href: "/recipes" });
    expect(waterProfilesBack(["admin"])).toEqual({ label: "Catalog", href: "/catalog" });
    expect(toWaterProfilesViewProps({ profiles: [], back: waterProfilesBack(["brewer"]) })).toMatchObject({ backLabel: "Recipes", backHref: "/recipes" });
  });
});
