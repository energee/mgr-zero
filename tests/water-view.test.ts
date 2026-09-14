// tests/water-view.test.ts — the Water screen's suggestion verb and ion read-out (spec 2026-09-14).
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WaterView } from "@/components/mgr/views/water";
import type { WaterDraft } from "@/lib/mgr/recipe-process-view";

const profiles = [
  { id: "denver", name: "Municipal · Denver", ions: { calcium: 42, magnesium: 8, sodium: 22, sulfate: 65, chloride: 30, bicarbonate: 110 } },
  { id: "hazy", name: "Hazy target", ions: { calcium: 110, magnesium: 10, sodium: 15, sulfate: 90, chloride: 180, bicarbonate: 40 } },
];
const salts = [{ id: "gypsum", name: "Gypsum", salt: "gypsum" as const }, { id: "lactic", name: "Lactic acid", salt: null }];
const draft: WaterDraft = { targetProfileId: "hazy", sourceProfileId: "denver", mashGal: "9.5", spargeGal: "12", targetMashPh: "", additions: [{ materialId: "gypsum", qty: 4, unit: "g", stage: "mash" }] };
const html = (props: Partial<Parameters<typeof WaterView>[0]>) => renderToStaticMarkup(createElement(WaterView, { water: draft, profiles, materials: salts, ...props }));

describe("WaterView", () => {
  it("draws the suggestion verb and six ion rows against the target", () => {
    const out = html({});
    expect(out).toMatch(/Suggest additions/);
    expect(out).toMatch(/Against target/);
    for (const ion of ["Calcium", "Magnesium", "Sodium", "Sulfate", "Chloride", "Bicarbonate"]) expect(out).toContain(ion);
    expect(out).toMatch(/30 of 180 ppm · −150/);
  });
  it("draws both gated when no material carries a salt yet", () => {
    const out = html({ materials: [{ id: "gypsum", name: "Gypsum" }, { id: "lactic", name: "Lactic acid" }] });
    expect(out.match(/data-gated/g)).toHaveLength(2);
    expect(out).not.toMatch(/Against target/);
  });
  it("draws only the verb gated when no salt is known and no target is picked either", () => {
    const out = html({ materials: [{ id: "gypsum", name: "Gypsum" }, { id: "lactic", name: "Lactic acid" }], water: { ...draft, targetProfileId: "" } });
    expect(out.match(/data-gated/g)).toHaveLength(1);
    expect(out).not.toMatch(/Against target/);
  });
  it("hides the read-out and disables the verb without a target", () => {
    const out = html({ water: { ...draft, targetProfileId: "" } });
    expect(out).not.toMatch(/Against target/);
    expect(out).toMatch(/<button[^>]*disabled[^>]*>[^<]*Suggest additions/);
  });
  it("the enabled verb is a clickable action, the disabled one a plain disabled button", () => {
    expect(html({})).toMatch(/data-row-action[^>]*>[^<]*Suggest additions/);
    expect(html({ water: { ...draft, mashGal: "0", spargeGal: "0" } })).toMatch(/<button[^>]*disabled/);
  });
});

it("the live sheet mounts WaterView with profile ions and no salt identity yet, so it draws gated", () => {
  const sheets = readFileSync("app/(app)/recipes/[id]/schedule-sheets.tsx", "utf8");
  expect(sheets).toMatch(/<WaterView\b/);
  expect(sheets).not.toMatch(/Suggest additions|Against target|salt:/);
  expect(readFileSync("app/(app)/recipes/[id]/page.tsx", "utf8")).toMatch(/profileIons/);
});
