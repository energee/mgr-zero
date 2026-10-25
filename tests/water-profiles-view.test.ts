// tests/water-profiles-view.test.ts — list_water_profiles rows → Water profiles view-model (issue #278),
// and the copy both sheets draw: names, units and the empty state (#1152);
// optional notes, alkalinity as CaCO3 and water pH (#1205).
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WaterProfileView } from "@/components/mgr/views/water-profile";
import { WaterProfilesView } from "@/components/mgr/views/water-profiles";
import { IONS, ionLine, toWaterProfileFields, toWaterProfileInput, toWaterProfilesViewProps, waterProfilesBack, waterProfileSaveReason, type WaterProfile } from "@/lib/mgr/water-profiles-view";
import { IONS as CHEMISTRY_IONS } from "@/lib/water-chemistry";

const hazy: WaterProfile = { id: "p1", name: "Hazy target", calcium_ppm: 110, magnesium_ppm: 10, sodium_ppm: 15, sulfate_ppm: 90, chloride_ppm: 180, bicarbonate_ppm: 40, alkalinity_ppm: null, water_ph: null, note: null };
const denver: WaterProfile = { ...hazy, id: "p2", name: "Denver tap", alkalinity_ppm: 92.5, water_ph: 7.8, note: "2026 city report" };

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
  it("supplies an empty state only when no profiles exist", () => {
    expect(toWaterProfilesViewProps({ profiles: [] }).empty).toBeDefined();
    expect(toWaterProfilesViewProps({ profiles: [hazy] }).empty).toBeUndefined();
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
  it("labels each ion with its unit and ties every ion input to the required, nonnegative ppm help", () => {
    const sheet = renderToStaticMarkup(createElement(WaterProfileView, { fields: toWaterProfileFields(hazy) }));
    for (const [, label] of IONS) expect(sheet).toContain(`${label} (ppm)`);
    const descriptions = new Set([...sheet.matchAll(/<[^>]*data-slot="field-description"[^>]*>/g)]
      .map(([tag]) => tag.match(/\bid="([^"]+)"/)?.[1]).filter(Boolean));
    const described = [...sheet.matchAll(/<input[^>]*aria-describedby="([^"]+)"/g)].map((m) => m[1]);
    expect(described).toHaveLength(IONS.length + 3);
    expect(described.slice(0, IONS.length)).toEqual(IONS.map(() => described[0]));
    expect(descriptions.has(described[0])).toBe(true);
    // Optional fields share a separate, existing description rather than ion-required guidance.
    expect(described.slice(IONS.length)).toEqual(Array(3).fill(described[IONS.length]));
    expect(described[IONS.length]).not.toBe(described[0]);
    expect(descriptions.has(described[IONS.length])).toBe(true);
  });
  it("sends Brewer back to Recipes, since Brewer cannot open Catalog", () => {
    expect(waterProfilesBack(["brewer"])).toEqual({ label: "Recipes", href: "/recipes" });
    expect(waterProfilesBack(["brewer", "taproom"])).toEqual({ label: "Recipes", href: "/recipes" });
    expect(waterProfilesBack(["admin"])).toEqual({ label: "Catalog", href: "/catalog" });
    expect(toWaterProfilesViewProps({ profiles: [], back: waterProfilesBack(["brewer"]) })).toMatchObject({ backLabel: "Recipes", backHref: "/recipes" });
  });
  it("preserves Settings as the destination for an Admin arriving from Source water", () => {
    const back = waterProfilesBack(["admin"], "settings");
    expect(back).toEqual({ label: "Settings", href: "/settings" });
    const html = renderToStaticMarkup(createElement(WaterProfilesView, { model: toWaterProfilesViewProps({ profiles: [], back }) }));
    expect(html).toContain('href="/settings"');
    expect(html).toContain("Settings");
    expect(waterProfilesBack(["brewer"], "settings")).toEqual({ label: "Recipes", href: "/recipes" });
    expect(waterProfilesBack(["admin"], "https://example.com")).toEqual({ label: "Catalog", href: "/catalog" });
  });
  it("names missing and invalid Save requirements while allowing zero and optional blanks", () => {
    const blank = toWaterProfileFields();
    expect(waterProfileSaveReason(blank)).toMatch(/profile name.*ions.*ppm/);
    const complete = toWaterProfileFields(hazy);
    expect(waterProfileSaveReason(complete)).toBeNull();
    expect(waterProfileSaveReason({ ...complete, calcium_ppm: "0", water_ph: "0", alkalinity_ppm: "0" })).toBeNull();
    expect(waterProfileSaveReason({ ...complete, water_ph: "14" })).toBeNull();
    expect(waterProfileSaveReason({ ...complete, sodium_ppm: "-1" })).toMatch(/ions.*ppm/);
    expect(waterProfileSaveReason({ ...complete, alkalinity_ppm: "-1" })).toMatch(/alkalinity.*CaCO3/);
    for (const water_ph of ["-1", "20"]) {
      expect(waterProfileSaveReason({ ...complete, water_ph })).toMatch(/water pH.*0.*14/);
    }
  });
  it("links disabled Save to its reason and clears both when requirements are met", () => {
    const blank = renderToStaticMarkup(createElement(WaterProfileView, { fields: toWaterProfileFields() }));
    const blankButton = blank.match(/<button([^>]*)>Save water profile<\/button>/)![1];
    expect(blankButton).toMatch(/\sdisabled(?:=|\s|$)/);
    const reasonId = blankButton.match(/aria-describedby="([^"]+)"/)![1];
    expect(blank).toContain(`<p id="${reasonId}"`);
    expect(blank).toMatch(/profile name.*ions.*ppm/);
    const complete = renderToStaticMarkup(createElement(WaterProfileView, { fields: toWaterProfileFields(hazy) }));
    const completeButton = complete.match(/<button([^>]*)>Save water profile<\/button>/)![1];
    expect(completeButton).not.toMatch(/\sdisabled(?:=|\s|$)/);
    expect(completeButton).not.toContain("aria-describedby");
    expect(complete).not.toContain(`<p id="${reasonId}"`);
  });
  it("shows alkalinity and water pH on a row only when the profile has them", () => {
    const [plain, measured] = toWaterProfilesViewProps({ profiles: [hazy, denver] }).rows;
    expect(plain.detail).toBe(ionLine(hazy));
    expect(measured.detail).toBe(`${ionLine(denver)} · Alkalinity 92.5 · Water pH 7.8`);
  });
  it("fills the sheet's optional fields from a profile, blank when unset", () => {
    expect(toWaterProfileFields(denver)).toMatchObject({ alkalinity_ppm: "92.5", water_ph: "7.8", note: "2026 city report" });
    expect(toWaterProfileFields(hazy)).toMatchObject({ alkalinity_ppm: "", water_ph: "", note: "" });
    expect(toWaterProfileFields()).toMatchObject({ alkalinity_ppm: "", water_ph: "", note: "" });
  });
  it("builds the upsert input: ions as numbers, a blank optional field left out", () => {
    expect(toWaterProfileInput(toWaterProfileFields(denver))).toEqual({
      name: "Denver tap", calciumPpm: 110, magnesiumPpm: 10, sodiumPpm: 15, sulfatePpm: 90, chloridePpm: 180, bicarbonatePpm: 40,
      alkalinityPpm: 92.5, waterPh: 7.8, note: "2026 city report",
    });
    const blank = toWaterProfileInput(toWaterProfileFields(hazy));
    expect(blank).toMatchObject({ alkalinityPpm: undefined, waterPh: undefined, note: "" });
  });
  it("labels the optional fields so water pH cannot be read as mash pH", () => {
    const sheet = renderToStaticMarkup(createElement(WaterProfileView, { fields: toWaterProfileFields(denver) }));
    for (const label of ["Alkalinity as CaCO3 (ppm)", "Water pH", "Notes"]) expect(sheet).toContain(`>${label}</label>`);
    const ph = sheet.match(/<input[^>]*aria-label="Water pH"[^>]*>/)?.[0];
    expect(ph).toBeDefined();
    expect(ph).not.toContain('required=""');
    expect(sheet).toMatch(/aria-label="Water pH"[^>]*max="14"|max="14"[^>]*aria-label="Water pH"/);
  });
});
